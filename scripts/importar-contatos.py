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

import re
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
            # Alguns nomes vêm prefixados com o código do cliente ("100103-DINNI
            # CALCADOS LTDA"). Guardamos a versão sem prefixo para casar com o
            # cadastro que já existe no CRM, onde o prefixo normalmente não está.
            "cliente_alt": re.sub(r"^\s*\d{3,}\s*-\s*", "", cliente).strip(),
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


NOTA = (
    "'Telefone ' || lower(coalesce(nullif(i.tipo, ''), 'não classificado'))\n"
    "       || ' da assinatura em chamados (confiança ' || lower(coalesce(nullif(i.confianca, ''), 'não informada')) || ').'"
)


def gerar_sql(registros: list[dict]) -> str:
    partes = [
        "-- Enriquece o CRM com os telefones extraídos das assinaturas no Zendesk.",
        "--",
        "-- A base já tem clientes e contatos vindos de outra origem, então a ordem importa:",
        "--   1. casa cada linha com o cliente que já existe (por código T ou nome)",
        "--   2. casa com o contato que já existe (por e-mail, depois por nome)",
        "--   3. preenche o telefone de quem já está cadastrado",
        "--   4. só então insere quem realmente não existe",
        "--",
        "-- Idempotente: rodar de novo não duplica nem sobrescreve telefone já preenchido.",
        "",
        "BEGIN;",
        "",
        "CREATE TEMP TABLE _import (",
        "  id serial PRIMARY KEY,",
        "  codigo_t text, cliente text, cliente_alt text, nome text, telefone text, tipo text,",
        "  email text, ocorrencias integer, confianca text, ultima timestamptz",
        ") ON COMMIT DROP;",
        "",
    ]

    for inicio in range(0, len(registros), LOTE):
        bloco = registros[inicio : inicio + LOTE]
        partes.append(
            "INSERT INTO _import (codigo_t, cliente, cliente_alt, nome, telefone, tipo, email, ocorrencias, confianca, ultima) VALUES"
        )
        valores = [
            "  ("
            + ", ".join(
                [
                    aspas(r["codigo_t"]),
                    aspas(r["cliente"]),
                    aspas(r["cliente_alt"]),
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

    partes.append(
        f"""-- ---------------------------------------------------------------
-- 1. Casa cada linha com o cliente que já existe no CRM.
--    Tenta pelo código T, pelo nome, e pelo nome sem o prefixo numérico.
-- ---------------------------------------------------------------
CREATE TEMP TABLE _cli ON COMMIT DROP AS
SELECT i.id AS imp_id,
       (SELECT c.id FROM public.clients c
         WHERE (NULLIF(i.codigo_t, '') IS NOT NULL AND lower(c.codigo_t) = lower(i.codigo_t))
            OR lower(c.nome) = lower(i.cliente)
            OR lower(c.nome) = lower(i.cliente_alt)
         ORDER BY (lower(c.codigo_t) = lower(NULLIF(i.codigo_t, ''))) DESC NULLS LAST, c.created_at
         LIMIT 1) AS client_id
FROM _import i;

-- 2. Cria só os clientes que realmente não existem.
INSERT INTO public.clients (nome, codigo_t, observacoes)
SELECT DISTINCT ON (lower(i.cliente))
       i.cliente, NULLIF(i.codigo_t, ''), 'Importado da base de chamados Zendesk.'
FROM _import i
JOIN _cli m ON m.imp_id = i.id
WHERE m.client_id IS NULL
ORDER BY lower(i.cliente), i.codigo_t NULLS LAST;

-- Refaz o vínculo para as linhas cujo cliente acabou de ser criado.
UPDATE _cli m
SET client_id = (SELECT c.id FROM public.clients c
                  WHERE lower(c.nome) = lower(i.cliente) ORDER BY c.created_at LIMIT 1)
FROM _import i
WHERE i.id = m.imp_id AND m.client_id IS NULL;

-- Completa o código T de clientes que já existiam sem ele.
UPDATE public.clients c
SET codigo_t = sub.codigo_t, updated_at = now()
FROM (SELECT DISTINCT ON (m.client_id) m.client_id, NULLIF(i.codigo_t, '') AS codigo_t
        FROM _import i JOIN _cli m ON m.imp_id = i.id
       WHERE NULLIF(i.codigo_t, '') IS NOT NULL
       ORDER BY m.client_id, i.ocorrencias DESC) sub
WHERE c.id = sub.client_id AND c.codigo_t IS NULL;

-- ---------------------------------------------------------------
-- 3. Casa cada linha com o contato que já existe: e-mail primeiro, nome depois.
-- ---------------------------------------------------------------
CREATE TEMP TABLE _ct ON COMMIT DROP AS
SELECT i.id AS imp_id, m.client_id,
       (SELECT ct.id FROM public.contacts ct
         WHERE ct.client_id = m.client_id
           AND ((NULLIF(i.email, '') IS NOT NULL AND lower(ct.email) = lower(i.email))
                OR lower(ct.nome) = lower(i.nome))
         ORDER BY (lower(ct.email) = lower(NULLIF(i.email, ''))) DESC NULLS LAST, ct.created_at
         LIMIT 1) AS contact_id
FROM _import i
JOIN _cli m ON m.imp_id = i.id;

-- 4. Preenche o telefone de quem já estava cadastrado sem ele.
--    Nunca sobrescreve telefone existente.
UPDATE public.contacts ct
SET telefone = sub.telefone,
    observacoes = btrim(coalesce(nullif(ct.observacoes, '') || ' ', '') || sub.nota),
    tickets = GREATEST(coalesce(ct.tickets, 0), sub.ocorrencias),
    ultima_interacao = GREATEST(ct.ultima_interacao, sub.ultima),
    updated_at = now()
FROM (SELECT DISTINCT ON (x.contact_id)
             x.contact_id, i.telefone, i.ocorrencias, i.ultima,
             {NOTA} AS nota
        FROM _ct x JOIN _import i ON i.id = x.imp_id
       WHERE x.contact_id IS NOT NULL
       ORDER BY x.contact_id, i.ocorrencias DESC) sub
WHERE ct.id = sub.contact_id AND ct.telefone IS NULL;

-- 5. Insere apenas quem não existe em lugar nenhum.
INSERT INTO public.contacts (client_id, nome, email, telefone, tickets, ultima_interacao, observacoes)
SELECT DISTINCT ON (x.client_id, lower(i.nome))
       x.client_id, i.nome, NULLIF(i.email, ''), i.telefone, i.ocorrencias, i.ultima,
       {NOTA}
FROM _ct x
JOIN _import i ON i.id = x.imp_id
WHERE x.contact_id IS NULL AND x.client_id IS NOT NULL
ORDER BY x.client_id, lower(i.nome), i.ocorrencias DESC;

-- ---------------------------------------------------------------
-- 6. Conferência antes de confirmar.
-- ---------------------------------------------------------------
SELECT (SELECT count(*) FROM public.clients)                                AS clientes,
       (SELECT count(*) FROM public.contacts)                               AS contatos,
       (SELECT count(*) FROM public.contacts WHERE telefone IS NOT NULL)    AS contatos_com_telefone,
       (SELECT count(*) FROM _ct WHERE contact_id IS NOT NULL)              AS linhas_casadas_com_contato_existente,
       (SELECT count(*) FROM _ct WHERE contact_id IS NULL)                  AS linhas_que_viraram_contato_novo;

COMMIT;
"""
    )
    return "\n".join(partes)


def filtrar_amostra(registros: list[dict], quantos: int, preferidos: list[str]) -> list[dict]:
    """
    Recorta uma amostra por cliente. Os clientes indicados em `preferidos` entram
    primeiro, para o teste incluir casos que sabidamente já existem no CRM.
    """
    por_cliente: dict[str, list[dict]] = defaultdict(list)
    for r in registros:
        por_cliente[normalizar(r["cliente"])].append(r)

    escolhidos: list[str] = []
    for nome in preferidos:
        chave = normalizar(nome)
        if chave in por_cliente and chave not in escolhidos:
            escolhidos.append(chave)

    for chave in sorted(por_cliente, key=lambda c: -len(por_cliente[c])):
        if len(escolhidos) >= quantos:
            break
        if chave not in escolhidos:
            escolhidos.append(chave)

    return [r for chave in escolhidos for r in por_cliente[chave]]


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    argumentos = [a for a in sys.argv[1:] if not a.startswith("--")]
    opcoes = [a for a in sys.argv[1:] if a.startswith("--")]

    planilha = argumentos[0]
    saida = argumentos[1] if len(argumentos) > 1 else "importar-contatos.sql"

    amostra = 0
    for opcao in opcoes:
        if opcao.startswith("--amostra="):
            amostra = int(opcao.split("=", 1)[1])

    registros, descartes, total = carregar(planilha)

    if amostra:
        registros = filtrar_amostra(
            registros,
            amostra,
            preferidos=["10 K DECORACOES CAMA MESA BANHO LTDA"],
        )

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
