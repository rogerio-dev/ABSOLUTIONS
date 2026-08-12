"""
Gera o SQL de importação dos contatos extraídos do Zendesk para o CRM.

  python scripts/importar-contatos.py <planilha.xlsx> [saida.sql]

A saída é um script idempotente: pode ser executado mais de uma vez sem
duplicar clientes nem contatos. Rode no SQL Editor do Supabase.

Limpezas aplicadas:
  - remove o balde "Sem Organização", que não é um cliente real
  - remove contatos com e-mail de domínio TOTVS quando o cliente não é a TOTVS
    (nesses casos a pessoa é o consultor que atendeu, não alguém do cliente)
  - deduplica por cliente + pessoa + telefone, mantendo a linha com mais
    ocorrências, que é a de maior confiança
"""

import sys
import unicodedata
from collections import defaultdict

import openpyxl

DOMINIOS_INTERNOS = ("totvs.com.br", "totvspartners.com.br", "totvs.com")
LOTE = 500


def normalizar(texto: str) -> str:
    """Chave de comparação: sem acento, sem espaço duplo, em minúsculas."""
    t = unicodedata.normalize("NFKD", (texto or "").strip())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return " ".join(t.split()).lower()


PARTICULAS = {"de", "da", "do", "das", "dos", "e", "di", "del", "van", "von", "la"}


def limpar_nome(bruto: str) -> str:
    """
    Tira a sujeira que veio da raspagem das assinaturas: aspas em volta,
    espaços repetidos e numeração colada no sobrenome. Nomes em caixa alta
    viram capitalizados, respeitando as partículas do português.
    """
    nome = (bruto or "").strip().strip("'\"").strip()
    nome = " ".join(nome.split())
    if not nome:
        return ""

    # "Simone Santos2" -> "Simone Santos"; preserva casos com hífen ou sigla
    palavras = nome.split()
    if palavras and len(palavras[-1]) > 3 and palavras[-1][:-1].isalpha() and palavras[-1][-1].isdigit():
        palavras[-1] = palavras[-1][:-1]
    nome = " ".join(palavras)

    # E-mail usado como nome fica intacto: capitalizar quebraria o endereço
    if "@" in nome:
        return nome

    if nome.isupper():
        partes = []
        for i, palavra in enumerate(nome.split()):
            minuscula = palavra.lower()
            partes.append(minuscula if i > 0 and minuscula in PARTICULAS else minuscula.capitalize())
        nome = " ".join(partes)

    return nome


def aspas(valor) -> str:
    if valor is None or str(valor).strip() == "":
        return "NULL"
    return "'" + str(valor).strip().replace("'", "''") + "'"


def numero(valor) -> str:
    try:
        return str(int(str(valor).strip()))
    except (TypeError, ValueError):
        return "0"


def carregar(caminho: str):
    wb = openpyxl.load_workbook(caminho, read_only=True, data_only=True)
    linhas = list(wb["Contatos com Telefone"].iter_rows(min_row=2, values_only=True))

    descartes = defaultdict(int)
    melhores: dict[tuple, dict] = {}

    for linha in linhas:
        cod, cliente, _org, nome, telefone, tipo, email, ocorr, conf, ultima = (list(linha) + [None] * 10)[:10]
        cliente = (cliente or "").strip()
        nome = limpar_nome(nome)
        telefone = (telefone or "").strip()
        email = (email or "").strip()

        if not cliente or not nome or not telefone:
            descartes["campos vazios"] += 1
            continue

        if normalizar(cliente) == "sem organizacao":
            descartes["sem organização"] += 1
            continue

        dominio = email.split("@")[-1].lower() if "@" in email else ""
        cliente_eh_totvs = normalizar(cliente).startswith("totvs")
        if dominio in DOMINIOS_INTERNOS and not cliente_eh_totvs:
            descartes["consultor, não contato do cliente"] += 1
            continue

        chave = (normalizar(cliente), normalizar(nome), telefone)
        registro = {
            "codigo_t": (cod or "").strip(),
            "cliente": cliente,
            "nome": nome,
            "telefone": telefone,
            "tipo": (tipo or "").strip(),
            "email": email,
            "ocorrencias": int(ocorr) if str(ocorr).strip().isdigit() else 0,
            "confianca": (conf or "").strip(),
            "ultima": (str(ultima).strip() if ultima else ""),
        }

        anterior = melhores.get(chave)
        if anterior is None or registro["ocorrencias"] > anterior["ocorrencias"]:
            melhores[chave] = registro

    return list(melhores.values()), descartes, len(linhas)


def gerar_sql(registros: list[dict]) -> str:
    partes = [
        "-- Importação de contatos extraídos do Zendesk para o CRM da AB Solutions.",
        "-- Idempotente: rodar de novo não duplica clientes nem contatos.",
        "",
        "BEGIN;",
        "",
        "CREATE TEMP TABLE _import (",
        "  codigo_t text, cliente text, nome text, telefone text, tipo text,",
        "  email text, ocorrencias integer, confianca text, ultima timestamptz",
        ") ON COMMIT DROP;",
        "",
    ]

    for inicio in range(0, len(registros), LOTE):
        bloco = registros[inicio : inicio + LOTE]
        partes.append("INSERT INTO _import (codigo_t, cliente, nome, telefone, tipo, email, ocorrencias, confianca, ultima) VALUES")
        valores = [
            "  ("
            + ", ".join(
                [
                    aspas(r["codigo_t"]),
                    aspas(r["cliente"]),
                    aspas(r["nome"]),
                    aspas(r["telefone"]),
                    aspas(r["tipo"]),
                    aspas(r["email"]),
                    numero(r["ocorrencias"]),
                    aspas(r["confianca"]),
                    aspas(r["ultima"]) + "::timestamptz" if r["ultima"] else "NULL",
                ]
            )
            + ")"
            for r in bloco
        ]
        partes.append(",\n".join(valores) + ";")
        partes.append("")

    partes.extend(
        [
            "-- Cria os clientes que ainda não existem, comparando pelo nome normalizado.",
            "INSERT INTO public.clients (nome, codigo_t, observacoes)",
            "SELECT DISTINCT ON (lower(i.cliente))",
            "       i.cliente,",
            "       NULLIF(i.codigo_t, ''),",
            "       'Importado da base de chamados Zendesk.'",
            "FROM _import i",
            "WHERE NOT EXISTS (",
            "  SELECT 1 FROM public.clients c WHERE lower(c.nome) = lower(i.cliente)",
            ")",
            "ORDER BY lower(i.cliente), i.codigo_t NULLS LAST;",
            "",
            "-- Preenche o código T em clientes que já existiam sem ele.",
            "UPDATE public.clients c",
            "SET codigo_t = sub.codigo_t",
            "FROM (",
            "  SELECT DISTINCT ON (lower(cliente)) lower(cliente) AS chave, NULLIF(codigo_t, '') AS codigo_t",
            "  FROM _import WHERE NULLIF(codigo_t, '') IS NOT NULL",
            "  ORDER BY lower(cliente), codigo_t",
            ") sub",
            "WHERE lower(c.nome) = sub.chave AND c.codigo_t IS NULL;",
            "",
            "-- Insere os contatos, evitando repetir pessoa com o mesmo telefone no mesmo cliente.",
            "WITH clientes AS (",
            "  SELECT DISTINCT ON (lower(nome)) lower(nome) AS chave, id FROM public.clients ORDER BY lower(nome), created_at",
            ")",
            "INSERT INTO public.contacts (client_id, nome, email, telefone, tickets, ultima_interacao, observacoes)",
            "SELECT cl.id, i.nome, NULLIF(i.email, ''), i.telefone, i.ocorrencias, i.ultima,",
            "       'Telefone ' || lower(coalesce(nullif(i.tipo, ''), 'não classificado'))",
            "       || ' extraído de assinatura em chamados. Confiança: ' || lower(coalesce(nullif(i.confianca, ''), 'não informada')) || '.'",
            "FROM _import i",
            "JOIN clientes cl ON cl.chave = lower(i.cliente)",
            "WHERE NOT EXISTS (",
            "  SELECT 1 FROM public.contacts ct",
            "  WHERE ct.client_id = cl.id",
            "    AND lower(ct.nome) = lower(i.nome)",
            "    AND ct.telefone = i.telefone",
            ");",
            "",
            "COMMIT;",
            "",
        ]
    )
    return "\n".join(partes)


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    planilha = sys.argv[1]
    saida = sys.argv[2] if len(sys.argv) > 2 else "importar-contatos.sql"

    registros, descartes, total = carregar(planilha)
    sql = gerar_sql(registros)

    with open(saida, "w", encoding="utf-8") as f:
        f.write(sql)

    clientes = len({normalizar(r["cliente"]) for r in registros})
    alta = sum(1 for r in registros if r["confianca"].lower() == "alta")

    print(f"linhas na planilha:      {total}")
    for motivo, quantidade in sorted(descartes.items()):
        print(f"  descartadas ({motivo}): {quantidade}")
    print(f"contatos a importar:     {len(registros)}  (confiança alta: {alta})")
    print(f"clientes a criar:        {clientes}")
    print(f"arquivo gerado:          {saida}")


if __name__ == "__main__":
    main()
