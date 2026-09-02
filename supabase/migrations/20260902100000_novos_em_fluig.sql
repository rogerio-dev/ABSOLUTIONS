-- Quem acabou de entrar em Fluig.
--
-- O momento de vender consultoria de Fluig não é quando a empresa usa o produto
-- há cinco anos: é quando ela acabou de entrar. Está implantando, tem dúvida
-- todo dia, e — o que mais importa — ainda não escolheu parceiro.
--
-- O extrato do datalake trouxe 511 empresas que entraram em Fluig nos últimos
-- doze meses, e duas informações que a base não tinha:
--
--   1. QUANDO cada uma entrou, e por qual porta (cliente novo na TOTVS, ou
--      cliente antigo que agora comprou Fluig).
--   2. Se ela JÁ TEM consultoria. São 421 de 511 que não têm — e essa é a
--      diferença entre uma conversa e uma disputa com o incumbente.
--
-- O e-mail do administrador do portal veio junto em 99,6% delas. Não é um
-- contato genérico: é quem administra o Fluig do lado do cliente, e quem
-- percebe primeiro que precisa de ajuda.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS fluig_entrada_em date,
  ADD COLUMN IF NOT EXISTS fluig_classe_entrada text,
  ADD COLUMN IF NOT EXISTS fluig_tem_consultoria boolean,
  ADD COLUMN IF NOT EXISTS fluig_consultorias text,
  ADD COLUMN IF NOT EXISTS canal_pvf text;

COMMENT ON COLUMN public.clients.fluig_entrada_em IS
  'Mês em que a empresa apareceu em Fluig pela primeira vez. Base do sinal mais forte de prospecção.';
COMMENT ON COLUMN public.clients.fluig_classe_entrada IS
  'recente = nova na TOTVS e em Fluig; cross_sell = já era TOTVS e comprou Fluig; novo_totvs = entrou pela TOTVS agora.';
COMMENT ON COLUMN public.clients.fluig_tem_consultoria IS
  'Verdadeiro quando já há consultoria atuando. Nulo significa que o extrato não apontou nenhuma.';

CREATE INDEX IF NOT EXISTS clients_entrada_fluig
  ON public.clients (fluig_entrada_em DESC) WHERE fluig_entrada_em IS NOT NULL;

-- ---------------------------------------------------------------
-- O score passa a pesar o momento
-- ---------------------------------------------------------------
-- CREATE OR REPLACE só acrescenta coluna no fim de uma view; inserir no meio
-- exige derrubar e recriar. A dependente vai junto, na ordem inversa.
DROP VIEW IF EXISTS public.prospeccao_ranqueada;
DROP VIEW IF EXISTS public.prospeccao;

-- Os pesos antigos foram reduzidos para abrir espaço, e não por serem errados:
-- é que uso e recência descrevem uma empresa madura em Fluig, enquanto entrada
-- recente descreve uma janela que fecha. Empresa que entrou mês passado e não
-- tem parceiro vale mais que uma conta grande e antiga já atendida por outro.
CREATE VIEW public.prospeccao
WITH (security_invoker = true) AS
WITH contatos AS (
  SELECT client_id,
         count(*)                                                        AS total,
         count(*) FILTER (WHERE telefone IS NOT NULL AND telefone <> '') AS com_telefone,
         count(*) FILTER (WHERE email IS NOT NULL AND email <> '')       AS com_email,
         count(*) FILTER (WHERE is_decisor)                              AS decisores
    FROM public.contacts
   GROUP BY client_id
)
SELECT
  c.id,
  c.nome,
  c.cnpj,
  c.classificacao,
  c.macro_segmento,
  c.segmento,
  c.ativo,
  c.tickets_fluig,
  c.tickets_abertos,
  c.ultimo_ticket,
  c.is_carteira,
  c.fluig_entrada_em,
  c.fluig_classe_entrada,
  c.fluig_tem_consultoria,
  c.fluig_consultorias,
  COALESCE(ct.total, 0)        AS contatos,
  COALESCE(ct.com_telefone, 0) AS telefones,
  COALESCE(ct.com_email, 0)    AS emails,
  COALESCE(ct.decisores, 0)    AS decisores,

  EXISTS (SELECT 1 FROM public.contracts k WHERE k.client_id = c.id
            AND k.situacao IN ('ativo', 'suspenso'))                     AS tem_contrato,
  EXISTS (SELECT 1 FROM public.deals d WHERE d.client_id = c.id
            AND d.stage NOT IN ('ganho', 'perdido'))                     AS no_funil,
  EXISTS (SELECT 1 FROM public.prospect_alvos a WHERE a.client_id = c.id
            AND a.situacao IN ('a_contatar', 'tentando', 'respondeu', 'reuniao_marcada')) AS em_onda,

  (c.ativo IS DISTINCT FROM 'Sim'
   OR c.classificacao IN ('Parceiro', 'Unidade Própria', 'TFS')
   OR c.nome ILIKE 'TOTVS%')                                             AS fora_do_alvo,

  -- Intensidade de uso: 0 a 20.
  LEAST(COALESCE(c.tickets_fluig, 0), 120)::numeric / 120 * 20           AS p_uso,

  -- Atividade recente: 0 a 15.
  CASE
    WHEN c.ultimo_ticket IS NULL THEN 0
    WHEN c.ultimo_ticket > now() - interval '3 months'  THEN 15
    WHEN c.ultimo_ticket > now() - interval '6 months'  THEN 12
    WHEN c.ultimo_ticket > now() - interval '12 months' THEN 9
    WHEN c.ultimo_ticket > now() - interval '24 months' THEN 5
    WHEN c.ultimo_ticket > now() - interval '48 months' THEN 2
    ELSE 0
  END::numeric                                                           AS p_recencia,

  -- Dor agora: 0 a 10.
  LEAST(COALESCE(c.tickets_abertos, 0), 10)::numeric / 10 * 10           AS p_dor,

  -- Porte: 0 a 10.
  CASE c.classificacao
    WHEN 'Large'  THEN 10
    WHEN 'Select' THEN 9
    WHEN 'VIP'    THEN 8
    WHEN 'Padrão' THEN 5
    WHEN 'Setor Público' THEN 3
    ELSE 3
  END::numeric                                                           AS p_porte,

  -- Alcançabilidade: 0 a 10.
  (LEAST(COALESCE(ct.com_telefone, 0), 1) * 4
   + LEAST(COALESCE(ct.com_email, 0), 1) * 3
   + LEAST(COALESCE(ct.decisores, 0), 1) * 3)::numeric                    AS p_alcance,

  -- Entrou agora em Fluig: 0 a 25. O sinal mais forte que existe nesta base,
  -- e o único que expira: em um ano essa empresa já escolheu com quem trabalha.
  CASE
    WHEN c.fluig_entrada_em IS NULL THEN 0
    WHEN c.fluig_entrada_em > current_date - interval '3 months'  THEN 25
    WHEN c.fluig_entrada_em > current_date - interval '6 months'  THEN 20
    WHEN c.fluig_entrada_em > current_date - interval '9 months'  THEN 15
    WHEN c.fluig_entrada_em > current_date - interval '12 months' THEN 10
    WHEN c.fluig_entrada_em > current_date - interval '18 months' THEN 5
    ELSE 0
  END::numeric                                                           AS p_momento,

  -- Sem parceiro: 0 a 10. Vale apenas para quem entrou agora — em conta antiga,
  -- não constar consultoria no extrato significa que ela resolve internamente,
  -- e não que a porta está aberta.
  CASE
    WHEN c.fluig_entrada_em IS NULL THEN 0
    WHEN COALESCE(c.fluig_tem_consultoria, false) THEN 0
    ELSE 10
  END::numeric                                                           AS p_sem_parceiro
FROM public.clients c
LEFT JOIN contatos ct ON ct.client_id = c.id;

CREATE VIEW public.prospeccao_ranqueada
WITH (security_invoker = true) AS
SELECT p.*,
       ROUND(p.p_uso + p.p_recencia + p.p_dor + p.p_porte + p.p_alcance
             + p.p_momento + p.p_sem_parceiro)::int AS score,
       (NOT p.fora_do_alvo AND NOT p.tem_contrato AND NOT p.no_funil AND NOT p.em_onda) AS disponivel
  FROM public.prospeccao p;

GRANT SELECT ON public.prospeccao, public.prospeccao_ranqueada TO authenticated;
REVOKE ALL ON public.prospeccao, public.prospeccao_ranqueada FROM anon;

-- ---------------------------------------------------------------
-- A onda passa a poder filtrar por entrada e por parceiro
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.montar_onda(
  _nome            text,
  _quantidade      int DEFAULT 100,
  _descricao       text DEFAULT NULL,
  _classificacoes  text[] DEFAULT NULL,
  _segmentos       text[] DEFAULT NULL,
  _score_minimo    int DEFAULT 0,
  _so_com_telefone boolean DEFAULT false,
  _meses_recencia  int DEFAULT NULL,
  _meses_entrada   int DEFAULT NULL,
  _sem_consultoria boolean DEFAULT false
) RETURNS TABLE (onda_id uuid, selecionados int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  nova uuid;
  n    int;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'apenas a equipe monta onda de prospeccao'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.prospect_ondas (nome, descricao, criterio, criada_por)
  VALUES (
    _nome, _descricao,
    jsonb_build_object(
      'quantidade', _quantidade,
      'classificacoes', to_jsonb(_classificacoes),
      'segmentos', to_jsonb(_segmentos),
      'score_minimo', _score_minimo,
      'so_com_telefone', _so_com_telefone,
      'meses_recencia', _meses_recencia,
      'meses_entrada', _meses_entrada,
      'sem_consultoria', _sem_consultoria
    ),
    auth.uid()
  )
  RETURNING id INTO nova;

  INSERT INTO public.prospect_alvos (onda_id, client_id, score, componentes)
  SELECT nova, r.id, r.score,
         jsonb_build_object(
           'uso', ROUND(r.p_uso), 'recencia', ROUND(r.p_recencia), 'dor', ROUND(r.p_dor),
           'porte', ROUND(r.p_porte), 'alcance', ROUND(r.p_alcance),
           'momento', ROUND(r.p_momento), 'sem_parceiro', ROUND(r.p_sem_parceiro),
           'tickets', r.tickets_fluig, 'abertos', r.tickets_abertos,
           'ultimo_ticket', r.ultimo_ticket,
           'entrada_fluig', r.fluig_entrada_em, 'classe', r.fluig_classe_entrada
         )
    FROM public.prospeccao_ranqueada r
   WHERE r.disponivel
     AND r.score >= COALESCE(_score_minimo, 0)
     AND (_classificacoes IS NULL OR r.classificacao = ANY (_classificacoes))
     AND (_segmentos IS NULL OR r.macro_segmento = ANY (_segmentos))
     AND (NOT _so_com_telefone OR r.telefones > 0)
     AND (_meses_recencia IS NULL
          OR r.ultimo_ticket > now() - make_interval(months => _meses_recencia))
     AND (_meses_entrada IS NULL
          OR (r.fluig_entrada_em IS NOT NULL
              AND r.fluig_entrada_em > current_date - make_interval(months => _meses_entrada)))
     AND (NOT _sem_consultoria OR NOT COALESCE(r.fluig_tem_consultoria, false))
   ORDER BY r.score DESC, r.fluig_entrada_em DESC NULLS LAST, r.tickets_fluig DESC
   LIMIT GREATEST(COALESCE(_quantidade, 100), 1);

  GET DIAGNOSTICS n = ROW_COUNT;

  IF n = 0 THEN
    DELETE FROM public.prospect_ondas WHERE id = nova;
    RETURN QUERY SELECT NULL::uuid, 0;
    RETURN;
  END IF;

  RETURN QUERY SELECT nova, n;
END; $fn$;

-- A assinatura antiga sai de circulação para não coexistirem duas versões.
DROP FUNCTION IF EXISTS public.montar_onda(text, int, text, text[], text[], int, boolean, int);

REVOKE EXECUTE ON FUNCTION
  public.montar_onda(text, int, text, text[], text[], int, boolean, int, int, boolean)
  FROM anon, public;
GRANT EXECUTE ON FUNCTION
  public.montar_onda(text, int, text, text[], text[], int, boolean, int, int, boolean)
  TO authenticated;
