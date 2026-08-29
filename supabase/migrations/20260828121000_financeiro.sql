-- Gestão financeira: caixa, a receber, a pagar e o custo de quem executa.
--
-- A decisão que organiza este módulo inteiro é sobre horas.
--
-- Dar ao desenvolvedor a liberdade de apontar hora é dar a ele a caneta que
-- escreve a própria fatura. Na prática o apontamento infla, e ninguém consegue
-- contestar depois do fato — o trabalho já foi feito, a memória de quanto
-- demorou é de quem fez.
--
-- Aqui a hora é ORÇADA no card, antes de o trabalho começar, por quem planeja o
-- projeto. O card já nasce valendo o que vale. O desenvolvedor recebe pelo card
-- concluído, e o total dos cards não pode passar o que foi vendido ao cliente.
-- Isso fecha o ciclo: o que entra pelo contrato e o que sai para quem executa
-- saem do mesmo número de horas.
--
-- O apontamento livre continua existindo em `contract_apontamentos`, mas para
-- outra coisa: consumir o banco de horas do CLIENTE. São medidas diferentes,
-- com donos diferentes, e misturá-las é como o custo deixa de bater com a
-- receita.

-- ---------------------------------------------------------------
-- Horas orçadas no projeto e no card
-- ---------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS horas_orcadas numeric(10,2),
  ADD COLUMN IF NOT EXISTS valor_hora_dev numeric(10,2);

COMMENT ON COLUMN public.projects.horas_orcadas IS
  'Teto de horas do projeto. A soma das horas dos cards não deveria passar disso — é o que foi vendido.';
COMMENT ON COLUMN public.projects.valor_hora_dev IS
  'Custo da hora de execução neste projeto. Vazio usa o valor do próprio colaborador.';

COMMENT ON COLUMN public.project_tasks.horas_estimadas IS
  'Horas ORÇADAS para o card, definidas por quem planeja. É o que se paga ao concluir — não é apontamento do executor.';

-- ---------------------------------------------------------------
-- Quem executa
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Opcional: dá para pagar quem não tem conta no sistema.
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  nome text NOT NULL,
  papel text,
  email text,
  telefone text,

  tipo_pessoa public.pessoa_tipo NOT NULL DEFAULT 'pj',
  documento text,
  razao_social text,

  modalidade public.pagamento_modalidade NOT NULL DEFAULT 'por_task',
  valor_mensal numeric(12,2),
  valor_hora numeric(10,2),
  dia_pagamento int CHECK (dia_pagamento BETWEEN 1 AND 31),

  -- Dado bancário fica aqui e só o administrador enxerga.
  banco text,
  agencia text,
  conta text,
  chave_pix text,

  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS colaboradores_ativos ON public.colaboradores (ativo, nome);
CREATE UNIQUE INDEX IF NOT EXISTS colaborador_por_perfil
  ON public.colaboradores (profile_id) WHERE profile_id IS NOT NULL;

-- ---------------------------------------------------------------
-- Onde o dinheiro está
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financeiro_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo public.conta_tipo NOT NULL DEFAULT 'corrente',
  banco text,
  -- O saldo não é recalculado desde o começo dos tempos: parte de uma foto
  -- informada por você e soma o que passou por aqui depois dela.
  saldo_inicial numeric(14,2) NOT NULL DEFAULT 0,
  saldo_inicial_em date NOT NULL DEFAULT current_date,
  ativa boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- A receber
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recebimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,

  descricao text NOT NULL,
  -- Primeiro dia do mês de referência. É o que evita cobrar duas vezes a
  -- mesma mensalidade quando alguém gera o mês de novo.
  competencia date NOT NULL,
  valor numeric(14,2) NOT NULL CHECK (valor >= 0),
  vencimento date NOT NULL,
  situacao public.titulo_situacao NOT NULL DEFAULT 'previsto',

  nf_numero text,
  nf_emitida_em date,

  pago_em date,
  valor_pago numeric(14,2),
  conta_id uuid REFERENCES public.financeiro_contas(id) ON DELETE SET NULL,

  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recebimentos_agenda ON public.recebimentos (vencimento, situacao);
CREATE INDEX IF NOT EXISTS recebimentos_cliente ON public.recebimentos (client_id, competencia DESC);

-- A mensalidade de um contrato existe uma vez por mês. Sem isto, rodar a
-- geração duas vezes duplicaria a cobrança do cliente.
CREATE UNIQUE INDEX IF NOT EXISTS recebimento_mensalidade_unica
  ON public.recebimentos (contract_id, competencia)
  WHERE contract_id IS NOT NULL AND situacao <> 'cancelado';

-- ---------------------------------------------------------------
-- A pagar
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.pagamento_tipo NOT NULL DEFAULT 'despesa',
  colaborador_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,

  descricao text NOT NULL,
  categoria text,
  competencia date NOT NULL,
  valor numeric(14,2) NOT NULL CHECK (valor >= 0),
  vencimento date NOT NULL,
  situacao public.titulo_situacao NOT NULL DEFAULT 'previsto',

  nf_numero text,
  nf_recebida_em date,

  pago_em date,
  valor_pago numeric(14,2),
  conta_id uuid REFERENCES public.financeiro_contas(id) ON DELETE SET NULL,

  -- Marca a despesa que se repete todo mês, para a projeção saber contar com ela.
  recorrente boolean NOT NULL DEFAULT false,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pagamentos_agenda ON public.pagamentos (vencimento, situacao);
CREATE INDEX IF NOT EXISTS pagamentos_colaborador ON public.pagamentos (colaborador_id, competencia DESC);

-- Um colaborador tem um fechamento por competência.
CREATE UNIQUE INDEX IF NOT EXISTS pagamento_colaborador_unico
  ON public.pagamentos (colaborador_id, competencia)
  WHERE colaborador_id IS NOT NULL AND tipo = 'colaborador' AND situacao <> 'cancelado';

-- Os cards que compõem um fechamento.
CREATE TABLE IF NOT EXISTS public.pagamento_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pagamento_id uuid NOT NULL REFERENCES public.pagamentos(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.project_tasks(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  horas numeric(8,2) NOT NULL DEFAULT 0,
  valor_hora numeric(10,2) NOT NULL DEFAULT 0,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pagamento_itens_do_titulo ON public.pagamento_itens (pagamento_id);

-- Um card é pago uma vez só. É esta linha que impede o mesmo trabalho entrar
-- em dois fechamentos.
CREATE UNIQUE INDEX IF NOT EXISTS task_paga_uma_vez
  ON public.pagamento_itens (task_id) WHERE task_id IS NOT NULL;

-- ---------------------------------------------------------------
-- Notas e comprovantes
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financeiro_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recebimento_id uuid REFERENCES public.recebimentos(id) ON DELETE CASCADE,
  pagamento_id uuid REFERENCES public.pagamentos(id) ON DELETE CASCADE,
  tipo public.financeiro_documento_tipo NOT NULL DEFAULT 'nf_emitida',
  nome text NOT NULL,
  caminho text NOT NULL UNIQUE,
  mime text,
  tamanho_bytes bigint,
  enviado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Um documento pertence a um título, nunca aos dois nem a nenhum.
  CONSTRAINT documento_de_um_titulo CHECK (
    (recebimento_id IS NOT NULL) <> (pagamento_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS fin_docs_recebimento ON public.financeiro_documentos (recebimento_id);
CREATE INDEX IF NOT EXISTS fin_docs_pagamento ON public.financeiro_documentos (pagamento_id);

-- ---------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financeiro_touch() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $fn$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['colaboradores', 'recebimentos', 'pagamentos'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS ao_mudar_%1$s ON public.%1$s', t);
    EXECUTE format(
      'CREATE TRIGGER ao_mudar_%1$s BEFORE UPDATE ON public.%1$s
       FOR EACH ROW EXECUTE FUNCTION public.financeiro_touch()', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- Segurança
-- ---------------------------------------------------------------
-- Financeiro é do administrador. Nem o time interno, nem o analista de suporte,
-- nem o cliente enxergam qualquer linha daqui — inclusive o dado bancário de
-- quem executa, que é o mais sensível do sistema inteiro.
ALTER TABLE public.colaboradores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_contas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimentos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamento_itens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_documentos  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['colaboradores', 'financeiro_contas', 'recebimentos',
                           'pagamentos', 'pagamento_itens', 'financeiro_documentos'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s admin" ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY "%1$s admin" ON public.%1$s FOR ALL TO authenticated
         USING (public.has_role(auth.uid(), ''admin''))
         WITH CHECK (public.has_role(auth.uid(), ''admin''))', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- Saúde do projeto: horas vendidas contra horas distribuídas
-- ---------------------------------------------------------------
-- Responde de uma vez a pergunta que o dono faz: quanto já paguei deste
-- projeto, quanto devo agora e quanto ainda vai custar até acabar.
CREATE OR REPLACE VIEW public.projeto_horas
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.nome,
  p.client_id,
  p.horas_orcadas,
  p.valor_hora_dev,
  COALESCE(sum(t.horas_estimadas), 0)                                        AS horas_nos_cards,
  COALESCE(sum(t.horas_estimadas) FILTER (WHERE t.status = 'done'), 0)       AS horas_concluidas,
  COALESCE(sum(t.horas_estimadas) FILTER (WHERE t.status <> 'done'), 0)      AS horas_pendentes,
  COALESCE(sum(t.horas_estimadas) FILTER (
    WHERE t.status = 'done' AND i.id IS NOT NULL), 0)                        AS horas_pagas,
  COALESCE(sum(t.horas_estimadas) FILTER (
    WHERE t.status = 'done' AND i.id IS NULL), 0)                            AS horas_a_pagar,
  -- Negativo significa card orçado além do que foi vendido.
  COALESCE(p.horas_orcadas, 0) - COALESCE(sum(t.horas_estimadas), 0)         AS horas_livres,
  count(t.id)                                                               AS cards
FROM public.projects p
LEFT JOIN public.project_tasks t ON t.project_id = p.id
LEFT JOIN public.pagamento_itens i ON i.task_id = t.id
GROUP BY p.id, p.nome, p.client_id, p.horas_orcadas, p.valor_hora_dev;

-- ---------------------------------------------------------------
-- O que devo a cada colaborador
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW public.colaborador_horas
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.nome,
  c.modalidade,
  c.valor_hora,
  c.valor_mensal,
  c.ativo,
  COALESCE(sum(t.horas_estimadas) FILTER (WHERE t.status <> 'done'), 0)   AS horas_pendentes,
  COALESCE(sum(t.horas_estimadas) FILTER (
    WHERE t.status = 'done' AND i.id IS NULL), 0)                          AS horas_a_pagar,
  COALESCE(sum(t.horas_estimadas) FILTER (
    WHERE t.status = 'done' AND i.id IS NOT NULL), 0)                      AS horas_pagas,
  COALESCE(sum(
    COALESCE(pr.valor_hora_dev, c.valor_hora, 0) * t.horas_estimadas
  ) FILTER (WHERE t.status = 'done' AND i.id IS NULL), 0)                  AS valor_a_pagar,
  count(t.id) FILTER (WHERE t.status = 'done' AND i.id IS NULL)            AS cards_a_pagar
FROM public.colaboradores c
LEFT JOIN public.project_tasks t ON t.responsavel_id = c.profile_id
LEFT JOIN public.projects pr ON pr.id = t.project_id
LEFT JOIN public.pagamento_itens i ON i.task_id = t.id
GROUP BY c.id, c.nome, c.modalidade, c.valor_hora, c.valor_mensal, c.ativo;

-- ---------------------------------------------------------------
-- Fechamento do colaborador
-- ---------------------------------------------------------------
-- Junta num título só todos os cards concluídos e ainda não pagos. Um título
-- por mês, e não um por card: pagar card a card geraria centenas de lançamentos
-- e nenhuma visão de quanto saiu no mês.
CREATE OR REPLACE FUNCTION public.fechar_colaborador(
  _colaborador uuid,
  _competencia date DEFAULT date_trunc('month', current_date)::date,
  _vencimento date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c        public.colaboradores%ROWTYPE;
  -- Nome com prefixo: `titulo` sozinho colide com project_tasks.titulo
  -- dentro do INSERT..SELECT, e o Postgres recusa por ambiguidade.
  id_titulo uuid;
  mes      date := date_trunc('month', _competencia)::date;
  vence    date;
  total    numeric := 0;
  qtd      int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'apenas o administrador fecha pagamento'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO c FROM public.colaboradores WHERE id = _colaborador;
  IF NOT FOUND THEN RAISE EXCEPTION 'colaborador nao encontrado'; END IF;
  IF c.modalidade = 'sem_custo' THEN
    RAISE EXCEPTION 'colaborador sem custo nao gera titulo';
  END IF;

  vence := COALESCE(
    _vencimento,
    (mes + interval '1 month')::date + COALESCE(c.dia_pagamento, 5) - 1
  );

  INSERT INTO public.pagamentos
    (tipo, colaborador_id, descricao, competencia, valor, vencimento, situacao, categoria)
  VALUES
    ('colaborador', c.id,
     c.nome || ' — ' || to_char(mes, 'MM/YYYY'),
     mes, 0, vence, 'previsto', 'Execução')
  RETURNING id INTO id_titulo;

  IF c.modalidade = 'fixo_mensal' THEN
    total := COALESCE(c.valor_mensal, 0);
  ELSE
    -- Cada card concluído e ainda não pago entra com as horas que foram
    -- orçadas nele, e não com hora apontada por quem executou.
    INSERT INTO public.pagamento_itens (pagamento_id, task_id, descricao, horas, valor_hora, valor)
    SELECT id_titulo, t.id,
           COALESCE(pr.nome || ' · ', '') || t.titulo,
           t.horas_estimadas,
           COALESCE(pr.valor_hora_dev, c.valor_hora, 0),
           ROUND(COALESCE(pr.valor_hora_dev, c.valor_hora, 0) * t.horas_estimadas, 2)
      FROM public.project_tasks t
      LEFT JOIN public.projects pr ON pr.id = t.project_id
      LEFT JOIN public.pagamento_itens i ON i.task_id = t.id
     WHERE t.responsavel_id = c.profile_id
       AND t.status = 'done'
       AND t.horas_estimadas IS NOT NULL
       AND t.horas_estimadas > 0
       AND i.id IS NULL;

    GET DIAGNOSTICS qtd = ROW_COUNT;
    SELECT COALESCE(sum(valor), 0) INTO total
      FROM public.pagamento_itens WHERE pagamento_id = id_titulo;

    IF qtd = 0 THEN
      -- Título vazio só polui a lista.
      DELETE FROM public.pagamentos WHERE id = id_titulo;
      RETURN NULL;
    END IF;
  END IF;

  UPDATE public.pagamentos SET valor = total WHERE id = id_titulo;
  RETURN id_titulo;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.fechar_colaborador(uuid, date, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fechar_colaborador(uuid, date, date) TO authenticated;

-- ---------------------------------------------------------------
-- Mensalidades dos contratos
-- ---------------------------------------------------------------
-- Gera o título do mês para cada contrato ativo com valor mensal. Roda quantas
-- vezes quiser: o índice único por contrato e competência não deixa duplicar.
CREATE OR REPLACE FUNCTION public.gerar_mensalidades(
  _competencia date DEFAULT date_trunc('month', current_date)::date
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  mes date := date_trunc('month', _competencia)::date;
  n   int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'apenas o administrador gera mensalidade'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.recebimentos
    (client_id, contract_id, descricao, competencia, valor, vencimento, situacao)
  SELECT k.client_id, k.id,
         COALESCE(NULLIF(k.numero, ''), 'Contrato') || ' — ' || to_char(mes, 'MM/YYYY'),
         mes,
         k.valor_mensal,
         -- Dia do vencimento do contrato, protegido contra mês curto:
         -- dia 31 em fevereiro vira o último dia de fevereiro.
         LEAST(
           mes + (COALESCE(k.dia_vencimento, 10) - 1),
           (mes + interval '1 month - 1 day')::date
         ),
         'previsto'
    FROM public.contracts k
   WHERE k.situacao = 'ativo'
     AND k.valor_mensal IS NOT NULL
     AND k.valor_mensal > 0
     AND (k.data_inicio IS NULL OR k.data_inicio <= (mes + interval '1 month - 1 day')::date)
     AND (k.prazo_indeterminado OR k.data_fim IS NULL OR k.data_fim >= mes)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.gerar_mensalidades(date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.gerar_mensalidades(date) TO authenticated;

-- ---------------------------------------------------------------
-- Caixa
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW public.saldo_das_contas
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.nome,
  c.tipo,
  c.banco,
  c.ativa,
  c.saldo_inicial,
  c.saldo_inicial_em,
  COALESCE((SELECT sum(r.valor_pago) FROM public.recebimentos r
             WHERE r.conta_id = c.id AND r.situacao = 'pago'
               AND r.pago_em >= c.saldo_inicial_em), 0) AS entradas,
  COALESCE((SELECT sum(p.valor_pago) FROM public.pagamentos p
             WHERE p.conta_id = c.id AND p.situacao = 'pago'
               AND p.pago_em >= c.saldo_inicial_em), 0) AS saidas,
  c.saldo_inicial
    + COALESCE((SELECT sum(r.valor_pago) FROM public.recebimentos r
                 WHERE r.conta_id = c.id AND r.situacao = 'pago'
                   AND r.pago_em >= c.saldo_inicial_em), 0)
    - COALESCE((SELECT sum(p.valor_pago) FROM public.pagamentos p
                 WHERE p.conta_id = c.id AND p.situacao = 'pago'
                   AND p.pago_em >= c.saldo_inicial_em), 0) AS saldo
FROM public.financeiro_contas c;

-- ---------------------------------------------------------------
-- Projeção
-- ---------------------------------------------------------------
-- Doze meses, para trás e para frente, com o que entrou e o que está previsto.
-- A despesa marcada como recorrente é repetida nos meses futuros: sem isso a
-- projeção mostraria lucro que não existe, porque a hospedagem e o contador
-- vão continuar chegando.
CREATE OR REPLACE FUNCTION public.projecao_financeira(_meses int DEFAULT 6)
RETURNS TABLE (
  mes date,
  a_receber numeric,
  recebido numeric,
  a_pagar numeric,
  pago numeric,
  recorrentes numeric,
  resultado numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH meses AS (
    SELECT generate_series(
             date_trunc('month', current_date) - interval '2 months',
             date_trunc('month', current_date) + make_interval(months => GREATEST(_meses, 1)),
             interval '1 month'
           )::date AS mes
  ),
  fixas AS (
    SELECT COALESCE(sum(valor), 0) AS total
      FROM public.pagamentos
     WHERE recorrente AND situacao <> 'cancelado'
       AND competencia = date_trunc('month', current_date)::date
  )
  SELECT m.mes,
         COALESCE((SELECT sum(r.valor) FROM public.recebimentos r
                    WHERE date_trunc('month', r.vencimento)::date = m.mes
                      AND r.situacao IN ('previsto', 'emitido')), 0),
         COALESCE((SELECT sum(r.valor_pago) FROM public.recebimentos r
                    WHERE date_trunc('month', r.pago_em)::date = m.mes
                      AND r.situacao = 'pago'), 0),
         COALESCE((SELECT sum(p.valor) FROM public.pagamentos p
                    WHERE date_trunc('month', p.vencimento)::date = m.mes
                      AND p.situacao IN ('previsto', 'emitido')), 0),
         COALESCE((SELECT sum(p.valor_pago) FROM public.pagamentos p
                    WHERE date_trunc('month', p.pago_em)::date = m.mes
                      AND p.situacao = 'pago'), 0),
         CASE WHEN m.mes > date_trunc('month', current_date)::date
              THEN (SELECT total FROM fixas) ELSE 0 END,
         COALESCE((SELECT sum(r.valor) FROM public.recebimentos r
                    WHERE date_trunc('month', r.vencimento)::date = m.mes
                      AND r.situacao IN ('previsto', 'emitido')), 0)
         + COALESCE((SELECT sum(r.valor_pago) FROM public.recebimentos r
                      WHERE date_trunc('month', r.pago_em)::date = m.mes
                        AND r.situacao = 'pago'), 0)
         - COALESCE((SELECT sum(p.valor) FROM public.pagamentos p
                      WHERE date_trunc('month', p.vencimento)::date = m.mes
                        AND p.situacao IN ('previsto', 'emitido')), 0)
         - COALESCE((SELECT sum(p.valor_pago) FROM public.pagamentos p
                      WHERE date_trunc('month', p.pago_em)::date = m.mes
                        AND p.situacao = 'pago'), 0)
         - CASE WHEN m.mes > date_trunc('month', current_date)::date
                THEN (SELECT total FROM fixas) ELSE 0 END
    FROM meses m
   ORDER BY m.mes;
$fn$;

REVOKE EXECUTE ON FUNCTION public.projecao_financeira(int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.projecao_financeira(int) TO authenticated;

GRANT SELECT ON public.projeto_horas, public.colaborador_horas, public.saldo_das_contas
  TO authenticated;
REVOKE ALL ON public.projeto_horas, public.colaborador_horas, public.saldo_das_contas FROM anon;
