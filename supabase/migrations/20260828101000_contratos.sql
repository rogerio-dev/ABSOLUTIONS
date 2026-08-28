-- Contratos de consultoria: o que uma AB Solutions precisa saber e provar.
--
-- A tabela anterior tinha oito campos e servia para listar. Não respondia
-- nenhuma das perguntas que aparecem no dia a dia: quantas horas restam neste
-- mês, quando este contrato renova sozinho, com que índice reajusta, quem
-- assinou, onde está o PDF assinado, qual SLA vale para os chamados deste
-- cliente.
--
-- O desenho gira em torno da modalidade. Contrato por banco de horas mede
-- saldo; fixo mensal não mede nada e entrega disponibilidade; projeto tem fim
-- e escopo fechado; horas avulsas fatura o que aconteceu. Guardar tudo em uma
-- tabela só, com a modalidade dizendo quais campos importam, evita quatro
-- tabelas quase iguais — e evita o contrato "meio banco de horas, meio projeto"
-- que a vida real produz.

-- ---------------------------------------------------------------
-- Contrato
-- ---------------------------------------------------------------
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS modalidade public.contrato_modalidade NOT NULL DEFAULT 'fixo_mensal',
  ADD COLUMN IF NOT EXISTS situacao public.contrato_situacao NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS objeto text,
  ADD COLUMN IF NOT EXISTS produtos text[] NOT NULL DEFAULT '{}',

  -- Vigência e renovação
  ADD COLUMN IF NOT EXISTS prazo_indeterminado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renovacao_automatica boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aviso_previo_dias int NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS reajuste public.contrato_reajuste NOT NULL DEFAULT 'nenhum',
  ADD COLUMN IF NOT EXISTS reajuste_mes int CHECK (reajuste_mes BETWEEN 1 AND 12),

  -- Dinheiro
  ADD COLUMN IF NOT EXISTS valor_mensal numeric(14,2),
  ADD COLUMN IF NOT EXISTS valor_hora numeric(10,2),
  ADD COLUMN IF NOT EXISTS valor_hora_extra numeric(10,2),
  ADD COLUMN IF NOT EXISTS dia_vencimento int CHECK (dia_vencimento BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS prazo_pagamento_dias int,
  ADD COLUMN IF NOT EXISTS forma_pagamento text,
  ADD COLUMN IF NOT EXISTS nota_fiscal_dia int CHECK (nota_fiscal_dia BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS iss_retido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS multa_atraso_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS juros_mes_pct numeric(5,2),

  -- Horas
  ADD COLUMN IF NOT EXISTS horas_mensais numeric(10,2),
  ADD COLUMN IF NOT EXISTS horas_acumulam boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS horas_validade_meses int,

  -- Atendimento
  ADD COLUMN IF NOT EXISTS sla_policy_id uuid REFERENCES public.sla_policies(id),
  ADD COLUMN IF NOT EXISTS horario_atendimento text,
  ADD COLUMN IF NOT EXISTS responsavel_id uuid,

  -- Quem é quem do lado do cliente
  ADD COLUMN IF NOT EXISTS contato_assinante text,
  ADD COLUMN IF NOT EXISTS contato_tecnico text,
  ADD COLUMN IF NOT EXISTS contato_financeiro text,

  -- Jurídico
  ADD COLUMN IF NOT EXISTS assinado_em date,
  ADD COLUMN IF NOT EXISTS forma_assinatura text,
  ADD COLUMN IF NOT EXISTS rescisao_aviso_dias int,
  ADD COLUMN IF NOT EXISTS multa_rescisao text,
  ADD COLUMN IF NOT EXISTS foro text,
  ADD COLUMN IF NOT EXISTS observacoes text;

COMMENT ON COLUMN public.contracts.horas_acumulam IS
  'Saldo não usado passa para o mês seguinte. Sem isso, o que sobrou é perdido na virada.';
COMMENT ON COLUMN public.contracts.horas_validade_meses IS
  'Por quantos meses o saldo acumulado ainda vale. Nulo é sem prazo.';
COMMENT ON COLUMN public.contracts.aviso_previo_dias IS
  'Antecedência para avisar que não vai renovar. É o número que define quando o contrato entra em alerta.';

-- O status antigo era texto livre. Migra para a coluna tipada e some.
UPDATE public.contracts
   SET situacao = CASE lower(COALESCE(status, 'ativo'))
                    WHEN 'ativo' THEN 'ativo'::public.contrato_situacao
                    WHEN 'encerrado' THEN 'encerrado'::public.contrato_situacao
                    WHEN 'suspenso' THEN 'suspenso'::public.contrato_situacao
                    WHEN 'cancelado' THEN 'cancelado'::public.contrato_situacao
                    ELSE 'ativo'::public.contrato_situacao
                  END
 WHERE status IS NOT NULL;

ALTER TABLE public.contracts DROP COLUMN IF EXISTS status;

CREATE INDEX IF NOT EXISTS contracts_cliente ON public.contracts (client_id, situacao);
CREATE INDEX IF NOT EXISTS contracts_vencendo ON public.contracts (data_fim)
  WHERE data_fim IS NOT NULL;

-- ---------------------------------------------------------------
-- Documentos
-- ---------------------------------------------------------------
-- O arquivo em si vai para o Storage; aqui fica o que se precisa saber sobre
-- ele sem baixar. `visivel_cliente` existe porque nem todo anexo é para os dois
-- lados: a minuta em negociação e o anexo de custo interno não são.
CREATE TABLE IF NOT EXISTS public.contract_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  tipo public.documento_tipo NOT NULL DEFAULT 'contrato_assinado',
  nome text NOT NULL,
  caminho text NOT NULL UNIQUE,
  mime text,
  tamanho_bytes bigint,
  visivel_cliente boolean NOT NULL DEFAULT true,
  descricao text,
  enviado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contract_documentos_contrato
  ON public.contract_documentos (contract_id, created_at DESC);

ALTER TABLE public.contract_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documentos staff" ON public.contract_documentos;
CREATE POLICY "documentos staff" ON public.contract_documentos FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "documentos do meu contrato" ON public.contract_documentos;
CREATE POLICY "documentos do meu contrato" ON public.contract_documentos FOR SELECT TO authenticated
  USING (
    visivel_cliente AND EXISTS (
      SELECT 1 FROM public.contracts c
       WHERE c.id = contract_id AND c.client_id = public.my_client_id()
    )
  );

-- ---------------------------------------------------------------
-- Apontamento de horas
-- ---------------------------------------------------------------
-- Sem isto, "40 horas por mês" é um número decorativo. É o lançamento que
-- transforma o contrato em saldo, e o saldo no que se discute na reunião de
-- acompanhamento.
CREATE TABLE IF NOT EXISTS public.contract_apontamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  data date NOT NULL DEFAULT current_date,
  horas numeric(6,2) NOT NULL CHECK (horas > 0),
  descricao text NOT NULL,
  consultor_id uuid,
  consultor_nome text,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  faturavel boolean NOT NULL DEFAULT true,
  visivel_cliente boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS apontamentos_contrato
  ON public.contract_apontamentos (contract_id, data DESC);

ALTER TABLE public.contract_apontamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apontamentos staff" ON public.contract_apontamentos;
CREATE POLICY "apontamentos staff" ON public.contract_apontamentos FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "apontamentos do meu contrato" ON public.contract_apontamentos;
CREATE POLICY "apontamentos do meu contrato" ON public.contract_apontamentos FOR SELECT TO authenticated
  USING (
    visivel_cliente AND EXISTS (
      SELECT 1 FROM public.contracts c
       WHERE c.id = contract_id AND c.client_id = public.my_client_id()
    )
  );

-- ---------------------------------------------------------------
-- Saldo de horas
-- ---------------------------------------------------------------
-- Devolve o consumo de um mês e o saldo que sobra, já considerando acúmulo.
--
-- O acúmulo é calculado do início da vigência até o mês pedido, e não guardado
-- em coluna: saldo guardado desanda no primeiro apontamento retroativo, e
-- apontamento retroativo é a regra, não a exceção.
CREATE OR REPLACE FUNCTION public.saldo_de_horas(_contrato uuid, _mes date DEFAULT current_date)
RETURNS TABLE (
  mes date,
  contratadas numeric,
  consumidas numeric,
  acumulado_anterior numeric,
  disponiveis numeric,
  saldo numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c              public.contracts%ROWTYPE;
  primeiro       date;
  inicio         date;
  meses_corridos int;
  gasto_anterior numeric;
  gasto_mes      numeric;
  acumulado      numeric := 0;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = _contrato;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Só entrega a quem já poderia ver o contrato.
  IF NOT (public.is_staff() OR c.client_id = public.my_client_id()) THEN
    RETURN;
  END IF;

  primeiro := date_trunc('month', _mes)::date;
  inicio   := date_trunc('month', COALESCE(c.data_inicio, primeiro))::date;

  SELECT COALESCE(sum(a.horas), 0) INTO gasto_mes
    FROM public.contract_apontamentos a
   WHERE a.contract_id = _contrato
     AND a.faturavel
     AND date_trunc('month', a.data)::date = primeiro;

  IF c.horas_acumulam AND primeiro > inicio THEN
    meses_corridos := (EXTRACT(YEAR FROM age(primeiro, inicio)) * 12
                       + EXTRACT(MONTH FROM age(primeiro, inicio)))::int;

    -- Saldo com prazo de validade só olha para trás até onde ele ainda vale.
    IF c.horas_validade_meses IS NOT NULL THEN
      meses_corridos := LEAST(meses_corridos, c.horas_validade_meses);
      inicio := (primeiro - make_interval(months => meses_corridos))::date;
    END IF;

    SELECT COALESCE(sum(a.horas), 0) INTO gasto_anterior
      FROM public.contract_apontamentos a
     WHERE a.contract_id = _contrato
       AND a.faturavel
       AND a.data >= inicio
       AND date_trunc('month', a.data)::date < primeiro;

    acumulado := GREATEST(COALESCE(c.horas_mensais, 0) * meses_corridos - gasto_anterior, 0);
  END IF;

  RETURN QUERY SELECT
    primeiro,
    COALESCE(c.horas_mensais, 0),
    gasto_mes,
    acumulado,
    COALESCE(c.horas_mensais, 0) + acumulado,
    COALESCE(c.horas_mensais, 0) + acumulado - gasto_mes;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.saldo_de_horas(uuid, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.saldo_de_horas(uuid, date) TO authenticated;

-- ---------------------------------------------------------------
-- Alerta de renovação
-- ---------------------------------------------------------------
-- Quantos dias faltam para a data em que ainda dá tempo de avisar que não vai
-- renovar. Passou disso e o contrato renova sozinho, queira-se ou não — é a
-- data que importa, não o fim da vigência.
CREATE OR REPLACE FUNCTION public.dias_para_avisar(_fim date, _aviso_dias int)
RETURNS int LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
           WHEN _fim IS NULL THEN NULL
           ELSE (_fim - COALESCE(_aviso_dias, 30) - current_date)
         END;
$fn$;
