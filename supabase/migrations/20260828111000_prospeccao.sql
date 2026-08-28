-- Prospecção sobre a base herdada.
--
-- O problema: são 8.297 empresas e uma pessoa. Atacar em ordem alfabética, ou
-- por "quem eu lembrar", desperdiça a única vantagem real que essa base tem —
-- ela não é uma lista comprada. Cada linha traz o histórico de chamados de
-- Fluig daquela empresa, o que diz três coisas que nenhuma lista fria diz:
-- se ela usa o produto, com que intensidade, e se ainda está viva nele.
--
-- O desenho tem duas camadas de propósito:
--
--   1. PROSPECÇÃO (aqui) — abordagem fria. Não tem valor nem previsão de
--      fechamento, porque inventar esses números polui o pipeline. Tem cadência:
--      tentativas, canal, próxima ação.
--   2. FUNIL (deals) — oportunidade de verdade, com valor e etapa.
--
-- A promoção entre as duas é explícita. Misturar as camadas é como o número do
-- pipeline deixa de significar alguma coisa.

-- ---------------------------------------------------------------
-- Ondas
-- ---------------------------------------------------------------
-- Uma onda é um lote fechado e datado. Trabalhar em lote, e não em fluxo
-- infinito, é o que permite aprender: a onda 1 converteu 3%, a onda 2 com outro
-- filtro converteu 7% — e aí o critério da onda 3 deixa de ser palpite.
CREATE TABLE IF NOT EXISTS public.prospect_ondas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  criterio jsonb NOT NULL DEFAULT '{}',
  criada_por uuid,
  encerrada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prospect_ondas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ondas staff" ON public.prospect_ondas;
CREATE POLICY "ondas staff" ON public.prospect_ondas FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE TABLE IF NOT EXISTS public.prospect_alvos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onda_id uuid NOT NULL REFERENCES public.prospect_ondas(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  -- O score no momento da seleção fica congelado de propósito: é o que permite
  -- comparar depois se quem pontuou alto de fato converteu mais.
  score int NOT NULL DEFAULT 0,
  componentes jsonb NOT NULL DEFAULT '{}',
  situacao public.alvo_situacao NOT NULL DEFAULT 'a_contatar',
  tentativas int NOT NULL DEFAULT 0,
  ultimo_contato_em timestamptz,
  proxima_acao_em date,
  canal text,
  responsavel_id uuid,
  observacao text,
  motivo_descarte text,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (onda_id, client_id)
);

-- A mesma empresa não pode estar sendo abordada por duas ondas ao mesmo tempo:
-- dois e-mails frios da mesma consultoria em uma semana queimam o contato.
CREATE UNIQUE INDEX IF NOT EXISTS alvo_unico_em_andamento
  ON public.prospect_alvos (client_id)
  WHERE situacao IN ('a_contatar', 'tentando', 'respondeu', 'reuniao_marcada');

CREATE INDEX IF NOT EXISTS alvos_da_onda ON public.prospect_alvos (onda_id, situacao, score DESC);
CREATE INDEX IF NOT EXISTS alvos_agenda ON public.prospect_alvos (proxima_acao_em)
  WHERE situacao IN ('a_contatar', 'tentando', 'respondeu', 'reuniao_marcada');

ALTER TABLE public.prospect_alvos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alvos staff" ON public.prospect_alvos;
CREATE POLICY "alvos staff" ON public.prospect_alvos FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE OR REPLACE FUNCTION public.alvo_touch() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $fn$;

DROP TRIGGER IF EXISTS ao_mudar_alvo ON public.prospect_alvos;
CREATE TRIGGER ao_mudar_alvo BEFORE UPDATE ON public.prospect_alvos
FOR EACH ROW EXECUTE FUNCTION public.alvo_touch();

-- ---------------------------------------------------------------
-- Score
-- ---------------------------------------------------------------
-- Uma view, não uma coluna: score guardado envelhece em silêncio, e o principal
-- ingrediente aqui é recência — que muda sozinha todo dia.
--
-- security_invoker faz a view rodar com as permissões de quem consulta, então a
-- RLS de `clients` continua valendo em vez de ser contornada.
CREATE OR REPLACE VIEW public.prospeccao
WITH (security_invoker = true) AS
WITH contatos AS (
  SELECT client_id,
         count(*)                                                   AS total,
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
  COALESCE(ct.total, 0)        AS contatos,
  COALESCE(ct.com_telefone, 0) AS telefones,
  COALESCE(ct.com_email, 0)    AS emails,
  COALESCE(ct.decisores, 0)    AS decisores,

  -- Quem já é cliente, já está no funil ou já está sendo trabalhado sai da fila.
  EXISTS (SELECT 1 FROM public.contracts k WHERE k.client_id = c.id
            AND k.situacao IN ('ativo', 'suspenso'))                     AS tem_contrato,
  EXISTS (SELECT 1 FROM public.deals d WHERE d.client_id = c.id
            AND d.stage NOT IN ('ganho', 'perdido'))                     AS no_funil,
  EXISTS (SELECT 1 FROM public.prospect_alvos a WHERE a.client_id = c.id
            AND a.situacao IN ('a_contatar', 'tentando', 'respondeu', 'reuniao_marcada')) AS em_onda,

  /*
   * Empresa do próprio grupo TOTVS, parceiro e unidade própria não são
   * prospect: estão na base porque abriam chamado, não porque compram
   * consultoria.
   */
  (c.ativo IS DISTINCT FROM 'Sim'
   OR c.classificacao IN ('Parceiro', 'Unidade Própria', 'TFS')
   OR c.nome ILIKE 'TOTVS%')                                             AS fora_do_alvo,

  -- ---- Componentes do score, expostos para a tela poder explicar o número ----

  -- Intensidade de uso: 0 a 30. Muito chamado é ambiente complexo sem quem
  -- resolva por dentro. O teto em 120 evita que a TOTVS, com 21 mil chamados,
  -- domine a lista sozinha.
  LEAST(COALESCE(c.tickets_fluig, 0), 120)::numeric / 120 * 30           AS p_uso,

  -- Atividade recente: 0 a 25. É o componente que mais separa. Empresa que não
  -- abre chamado há três anos provavelmente largou o Fluig, e vender
  -- sustentação de um produto abandonado não acontece.
  CASE
    WHEN c.ultimo_ticket IS NULL THEN 0
    WHEN c.ultimo_ticket > now() - interval '3 months'  THEN 25
    WHEN c.ultimo_ticket > now() - interval '6 months'  THEN 21
    WHEN c.ultimo_ticket > now() - interval '12 months' THEN 15
    WHEN c.ultimo_ticket > now() - interval '24 months' THEN 8
    WHEN c.ultimo_ticket > now() - interval '48 months' THEN 3
    ELSE 0
  END::numeric                                                           AS p_recencia,

  -- Dor agora: 0 a 15. Chamado aberto neste momento é gancho de conversa —
  -- "vi que vocês estão com pendência em X" abre porta que e-mail frio não abre.
  LEAST(COALESCE(c.tickets_abertos, 0), 10)::numeric / 10 * 15           AS p_dor,

  -- Porte: 0 a 15. Large e Select pagam contrato maior. Setor público compra,
  -- mas por licitação: cabe na base, não na primeira onda.
  CASE c.classificacao
    WHEN 'Large'  THEN 15
    WHEN 'Select' THEN 14
    WHEN 'VIP'    THEN 12
    WHEN 'Padrão' THEN 7
    WHEN 'Setor Público' THEN 5
    ELSE 4
  END::numeric                                                           AS p_porte,

  -- Alcançabilidade: 0 a 15. Score alto sem telefone não vira reunião, vira
  -- e-mail sem resposta.
  (LEAST(COALESCE(ct.com_telefone, 0), 1) * 7
   + LEAST(COALESCE(ct.com_email, 0), 1) * 4
   + LEAST(COALESCE(ct.decisores, 0), 1) * 4)::numeric                    AS p_alcance
FROM public.clients c
LEFT JOIN contatos ct ON ct.client_id = c.id;

COMMENT ON VIEW public.prospeccao IS
  'Base de prospecção com score explicável. Os campos p_* são os componentes, para a tela mostrar por que a empresa está naquela posição.';

-- View de cima, já com o total somado e ordenável.
CREATE OR REPLACE VIEW public.prospeccao_ranqueada
WITH (security_invoker = true) AS
SELECT p.*,
       ROUND(p.p_uso + p.p_recencia + p.p_dor + p.p_porte + p.p_alcance)::int AS score,
       (NOT p.fora_do_alvo AND NOT p.tem_contrato AND NOT p.no_funil AND NOT p.em_onda) AS disponivel
  FROM public.prospeccao p;

GRANT SELECT ON public.prospeccao, public.prospeccao_ranqueada TO authenticated;
REVOKE ALL ON public.prospeccao, public.prospeccao_ranqueada FROM anon;

-- ---------------------------------------------------------------
-- Montagem da onda
-- ---------------------------------------------------------------
-- Pega as N melhores empresas ainda disponíveis, dentro dos filtros pedidos.
-- Roda como SECURITY DEFINER só para poder ler a view inteira de uma vez; o
-- primeiro comando confere que quem chamou é da equipe.
CREATE OR REPLACE FUNCTION public.montar_onda(
  _nome            text,
  _quantidade      int DEFAULT 100,
  _descricao       text DEFAULT NULL,
  _classificacoes  text[] DEFAULT NULL,
  _segmentos       text[] DEFAULT NULL,
  _score_minimo    int DEFAULT 0,
  _so_com_telefone boolean DEFAULT false,
  _meses_recencia  int DEFAULT NULL
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
      'meses_recencia', _meses_recencia
    ),
    auth.uid()
  )
  RETURNING id INTO nova;

  INSERT INTO public.prospect_alvos (onda_id, client_id, score, componentes)
  SELECT nova, r.id, r.score,
         jsonb_build_object(
           'uso', ROUND(r.p_uso), 'recencia', ROUND(r.p_recencia), 'dor', ROUND(r.p_dor),
           'porte', ROUND(r.p_porte), 'alcance', ROUND(r.p_alcance),
           'tickets', r.tickets_fluig, 'abertos', r.tickets_abertos,
           'ultimo_ticket', r.ultimo_ticket
         )
    FROM public.prospeccao_ranqueada r
   WHERE r.disponivel
     AND r.score >= COALESCE(_score_minimo, 0)
     AND (_classificacoes IS NULL OR r.classificacao = ANY (_classificacoes))
     AND (_segmentos IS NULL OR r.macro_segmento = ANY (_segmentos))
     AND (NOT _so_com_telefone OR r.telefones > 0)
     AND (_meses_recencia IS NULL
          OR r.ultimo_ticket > now() - make_interval(months => _meses_recencia))
   ORDER BY r.score DESC, r.tickets_fluig DESC
   LIMIT GREATEST(COALESCE(_quantidade, 100), 1);

  GET DIAGNOSTICS n = ROW_COUNT;

  -- Onda vazia é ruído na lista: some sozinha.
  IF n = 0 THEN
    DELETE FROM public.prospect_ondas WHERE id = nova;
    RETURN QUERY SELECT NULL::uuid, 0;
    RETURN;
  END IF;

  RETURN QUERY SELECT nova, n;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.montar_onda(text, int, text, text[], text[], int, boolean, int)
  FROM anon, public;
GRANT EXECUTE ON FUNCTION public.montar_onda(text, int, text, text[], text[], int, boolean, int)
  TO authenticated;

-- ---------------------------------------------------------------
-- Promoção ao funil
-- ---------------------------------------------------------------
-- O momento em que o alvo deixa de ser abordagem fria e vira oportunidade com
-- valor. Faz as duas coisas juntas para não existir alvo promovido sem deal,
-- nem deal órfão sem registro de onde veio.
CREATE OR REPLACE FUNCTION public.promover_alvo(
  _alvo uuid,
  _titulo text,
  _valor numeric DEFAULT NULL,
  _previsao date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  a    public.prospect_alvos%ROWTYPE;
  novo uuid;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'apenas a equipe promove alvo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO a FROM public.prospect_alvos WHERE id = _alvo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'alvo nao encontrado';
  END IF;
  IF a.deal_id IS NOT NULL THEN
    RETURN a.deal_id;
  END IF;

  INSERT INTO public.deals (client_id, titulo, valor, stage, previsao_fechamento, owner_id)
  VALUES (a.client_id, _titulo, _valor, 'contatado', _previsao, COALESCE(a.responsavel_id, auth.uid()))
  RETURNING id INTO novo;

  UPDATE public.prospect_alvos
     SET situacao = 'virou_oportunidade', deal_id = novo
   WHERE id = _alvo;

  RETURN novo;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.promover_alvo(uuid, text, numeric, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.promover_alvo(uuid, text, numeric, date) TO authenticated;
