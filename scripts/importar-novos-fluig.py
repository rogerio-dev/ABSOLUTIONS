"""
Importa os clientes que entraram em Fluig no último ano.

    python scripts/importar-novos-fluig.py [caminho.xlsx]

A planilha vem do datalake do Zendesk (D-1) e traz, por empresa, quando ela
apareceu em Fluig, por qual porta, e se já existe consultoria atuando.

O casamento com a base é feito em três passadas, da mais confiável para a menos:
código T exato, código T contido na lista de códigos de um grupo (a base tem
registros com vários códigos separados por ponto e vírgula) e, por fim, CNPJ.
O que não casar entra como empresa nova — é gente que a base herdada não tinha.

Nada é apagado e nada é sobrescrito às cegas: telefone e nome existentes ficam
como estão. O que a planilha acrescenta são os campos de entrada em Fluig e o
contato do administrador do portal.
"""

import os
import re
import sys
from pathlib import Path

import pandas as pd
import psycopg

CAMINHO_PADRAO = (
    Path.home()
    / "OneDrive"
    / "Documentos"
    / "PROJETO BUSCA CONSULTORIAS FLUIG"
    / "data"
    / "clientes_novos_fluig.xlsx"
)

CLASSES = {
    "Cliente recente": "recente",
    "Novo em Fluig (cross-sell)": "cross_sell",
    "Novo na TOTVS": "novo_totvs",
}


def limpar(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return s or None


def so_digitos(v):
    s = limpar(v)
    return re.sub(r"\D", "", s) if s else None


def nome_limpo(v):
    """A planilha anexa o código ao nome: "EMPRESA LTDA - T05238"."""
    s = limpar(v) or ""
    return re.sub(r"\s+-\s+T[A-Z0-9]{4,}$", "", s).strip() or s


def main() -> None:
    caminho = Path(sys.argv[1]) if len(sys.argv) > 1 else CAMINHO_PADRAO
    if not caminho.exists():
        sys.exit(f"planilha nao encontrada: {caminho}")

    senha = os.environ.get("SB_PASS")
    if not senha:
        sys.exit("defina SB_PASS com a senha do banco")

    df = pd.read_excel(caminho, sheet_name="Clientes Fluig novos")
    print(f"{len(df)} empresas na planilha")

    con = psycopg.connect(
        host="db.dsllhewvehnzxgxgbixm.supabase.co", port=5432, dbname="postgres",
        user="postgres", password=senha, sslmode="require", connect_timeout=30,
    )
    con.autocommit = False
    cur = con.cursor()
    cur.execute("SET statement_timeout = '15min'")

    # Índices de casamento, carregados uma vez. Percorrer 8 mil clientes por
    # linha da planilha levaria minutos; em memória é instantâneo.
    cur.execute("SELECT id, codigo_t, cnpj FROM public.clients")
    por_codigo: dict[str, str] = {}
    por_cnpj: dict[str, str] = {}
    for cid, codigo, cnpj in cur.fetchall():
        for parte in (codigo or "").split(";"):
            parte = parte.strip()
            if parte:
                por_codigo.setdefault(parte, cid)
        digitos = so_digitos(cnpj)
        if digitos:
            por_cnpj.setdefault(digitos, cid)

    atualizados = novos = contatos_novos = 0

    for _, linha in df.iterrows():
        codigo = limpar(linha["codigo_t"])
        cnpj = so_digitos(linha["cnpj"])
        nome = nome_limpo(linha["cliente"])

        alvo = (por_codigo.get(codigo) if codigo else None) or (por_cnpj.get(cnpj) if cnpj else None)

        entrada = limpar(linha["mes_entrada"])
        entrada_data = f"{entrada}-01" if entrada and re.fullmatch(r"\d{4}-\d{2}", entrada) else None
        classe = CLASSES.get(limpar(linha["classificacao_entrada"]) or "", None)
        tem_consultoria = limpar(linha["tem_consultoria"]) == "Sim"
        consultorias = limpar(linha["consultorias"])

        campos = dict(
            fluig_entrada_em=entrada_data,
            fluig_classe_entrada=classe,
            fluig_tem_consultoria=tem_consultoria,
            fluig_consultorias=consultorias,
            canal_pvf=limpar(linha["canal_pvf"]),
        )

        if alvo:
            cur.execute(
                """
                UPDATE public.clients SET
                  fluig_entrada_em = %(fluig_entrada_em)s,
                  fluig_classe_entrada = %(fluig_classe_entrada)s,
                  fluig_tem_consultoria = %(fluig_tem_consultoria)s,
                  fluig_consultorias = %(fluig_consultorias)s,
                  canal_pvf = COALESCE(%(canal_pvf)s, canal_pvf),
                  -- Só preenche o que está vazio: o cadastro existente foi
                  -- conferido antes e não deve ser sobrescrito pelo extrato.
                  segmento = COALESCE(segmento, %(segmento)s),
                  macro_segmento = COALESCE(macro_segmento, %(macro)s),
                  classificacao = COALESCE(classificacao, %(classificacao)s),
                  razao_social = COALESCE(razao_social, %(razao)s),
                  updated_at = now()
                WHERE id = %(id)s
                """,
                {**campos, "id": alvo, "segmento": limpar(linha["segmento"]),
                 "macro": limpar(linha["macro_segmento"]),
                 "classificacao": limpar(linha["classificacao"]),
                 "razao": limpar(linha["razao_social"])},
            )
            atualizados += 1
        else:
            cur.execute(
                """
                INSERT INTO public.clients
                  (nome, codigo_t, cnpj, razao_social, tipo, ativo, classificacao,
                   segmento, macro_segmento, email_financeiro, tickets_fluig,
                   fluig_entrada_em, fluig_classe_entrada, fluig_tem_consultoria,
                   fluig_consultorias, canal_pvf)
                VALUES
                  (%(nome)s, %(codigo)s, %(cnpj)s, %(razao)s, 'Cliente',
                   %(ativo)s, %(classificacao)s, %(segmento)s, %(macro)s,
                   %(email_fin)s, %(tickets)s,
                   %(fluig_entrada_em)s, %(fluig_classe_entrada)s,
                   %(fluig_tem_consultoria)s, %(fluig_consultorias)s, %(canal_pvf)s)
                RETURNING id
                """,
                {**campos, "nome": nome, "codigo": codigo, "cnpj": limpar(linha["cnpj"]),
                 "razao": limpar(linha["razao_social"]),
                 "ativo": "Sim" if limpar(linha["cadastro_ativo"]) in (None, "Sim") else "Não",
                 "classificacao": limpar(linha["classificacao"]),
                 "segmento": limpar(linha["segmento"]),
                 "macro": limpar(linha["macro_segmento"]),
                 "email_fin": limpar(linha["email_financeiro"]),
                 "tickets": int(linha["tickets_fluig"]) if pd.notna(linha["tickets_fluig"]) else 0},
            )
            alvo = cur.fetchone()[0]
            if codigo:
                por_codigo[codigo] = alvo
            novos += 1

        # O administrador do portal é quem opera o Fluig do lado do cliente, e
        # quem sente primeiro a falta de quem ajude. Entra como decisor.
        adm = limpar(linha["adm_portal"])
        # E-mail da TOTVS no campo do administrador é o consultor que fez a
        # implantação, não o cliente. Marcar como decisor mandaria você falar
        # com um funcionário da TOTVS achando que fala com a empresa.
        da_totvs = bool(adm) and adm.lower().endswith(("@totvs.com.br", "@ext.totvs.com.br"))
        if adm and "@" in adm and not da_totvs:
            cur.execute(
                """
                INSERT INTO public.contacts (client_id, nome, email, cargo, papel, is_decisor)
                SELECT %(cliente)s, %(nome)s, %(email)s,
                       'Administrador do portal Fluig', 'Administrador Fluig', true
                 WHERE NOT EXISTS (
                   SELECT 1 FROM public.contacts
                    WHERE client_id = %(cliente)s AND lower(email) = lower(%(email)s)
                 )
                """,
                {"cliente": alvo, "email": adm, "nome": adm.split("@")[0].replace(".", " ").title()},
            )
            contatos_novos += cur.rowcount

    con.commit()

    print(f"\n{atualizados} empresas atualizadas · {novos} novas · {contatos_novos} contatos de portal")

    cur.execute(
        """
        SELECT fluig_classe_entrada,
               count(*),
               count(*) FILTER (WHERE NOT COALESCE(fluig_tem_consultoria, false))
          FROM public.clients WHERE fluig_entrada_em IS NOT NULL
         GROUP BY 1 ORDER BY 2 DESC
        """
    )
    print("\nna base agora:")
    for classe, total, sem in cur.fetchall():
        print(f"  {str(classe):<12} {total:>4} empresas, {sem} sem consultoria")

    con.close()


if __name__ == "__main__":
    main()
