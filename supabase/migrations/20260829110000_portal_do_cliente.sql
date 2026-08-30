-- O que o cliente passa a ver, e o que ele passa a poder decidir.
--
-- Duas lacunas que apareceram ao comparar o portal com o que se espera de um
-- portal de consultoria:
--
--   1. FATURA. O cliente não via nada do que foi cobrado. Nota fiscal ia por
--      e-mail e se perdia na caixa de entrada; a pergunta "cadê a NF de março"
--      voltava para nós toda vez.
--
--   2. ACEITE. Entrega era aprovada por conversa. Sem registro de quem
--      aprovou e quando, "isso não era o combinado" três meses depois é uma
--      discussão que ninguém ganha.
--
-- O que o cliente NÃO passa a ver continua igualmente deliberado: nada de
-- pagamentos, custo de execução, valor de hora do desenvolvedor ou margem. O
-- financeiro do cliente é o extrato dele, não o nosso.

-- ---------------------------------------------------------------
-- Faturas do cliente
-- ---------------------------------------------------------------
-- Leitura apenas, e só do que já foi faturado: título ainda em 'previsto' é
-- projeção interna e mostrar isso viraria cobrança que ninguém combinou.
DROP POLICY IF EXISTS "recebimentos do meu cliente" ON public.recebimentos;
CREATE POLICY "recebimentos do meu cliente" ON public.recebimentos FOR SELECT TO authenticated
  USING (
    client_id = public.my_client_id()
    AND situacao IN ('emitido', 'pago')
  );

-- A nota fiscal do título que ele já pode ver.
DROP POLICY IF EXISTS "documentos da minha fatura" ON public.financeiro_documentos;
CREATE POLICY "documentos da minha fatura" ON public.financeiro_documentos FOR SELECT TO authenticated
  USING (
    recebimento_id IS NOT NULL
    AND tipo IN ('nf_emitida', 'boleto')
    AND EXISTS (
      SELECT 1 FROM public.recebimentos r
       WHERE r.id = recebimento_id
         AND r.client_id = public.my_client_id()
         AND r.situacao IN ('emitido', 'pago')
    )
  );

-- O arquivo em si. Mesma condição da linha, para desmarcar um lado não deixar
-- o outro aberto.
DROP POLICY IF EXISTS "financeiro leitura do cliente" ON storage.objects;
CREATE POLICY "financeiro leitura do cliente" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'financeiro'
    AND EXISTS (
      SELECT 1
        FROM public.financeiro_documentos d
        JOIN public.recebimentos r ON r.id = d.recebimento_id
       WHERE d.caminho = storage.objects.name
         AND d.tipo IN ('nf_emitida', 'boleto')
         AND r.client_id = public.my_client_id()
         AND r.situacao IN ('emitido', 'pago')
    )
  );

-- ---------------------------------------------------------------
-- Aceite de entrega
-- ---------------------------------------------------------------
CREATE TYPE public.aceite_situacao AS ENUM (
  'aguardando',  -- entregue, esperando o cliente olhar
  'aprovado',
  'ajuste'       -- cliente pediu correção
);

CREATE TABLE IF NOT EXISTS public.entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.project_tasks(id) ON DELETE SET NULL,

  titulo text NOT NULL,
  descricao text,
  -- O que muda para o cliente na operação dele. Descrição técnica não serve
  -- de base para aceite: ninguém aprova o que não entende.
  resultado text,
  versao int NOT NULL DEFAULT 1,

  situacao public.aceite_situacao NOT NULL DEFAULT 'aguardando',
  enviada_em timestamptz NOT NULL DEFAULT now(),
  enviada_por uuid,

  -- A trilha: quem decidiu, quando, e o que disse.
  decidida_em timestamptz,
  decidida_por uuid,
  decidida_por_nome text,
  decidida_por_email text,
  observacao_cliente text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entregas_do_projeto ON public.entregas (project_id, enviada_em DESC);
CREATE INDEX IF NOT EXISTS entregas_pendentes ON public.entregas (situacao)
  WHERE situacao = 'aguardando';

ALTER TABLE public.entregas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entregas staff" ON public.entregas;
CREATE POLICY "entregas staff" ON public.entregas FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "entregas do meu projeto" ON public.entregas;
CREATE POLICY "entregas do meu projeto" ON public.entregas FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
     WHERE p.id = project_id AND p.client_id = public.my_client_id()
  ));

-- O cliente decide, e só isso. A atualização passa por função para ele não
-- conseguir reescrever título, versão nem a data de envio.
CREATE OR REPLACE FUNCTION public.decidir_entrega(
  _entrega uuid,
  _aprovar boolean,
  _observacao text DEFAULT NULL
) RETURNS public.aceite_situacao
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  e     public.entregas%ROWTYPE;
  nova  public.aceite_situacao;
  quem  text;
BEGIN
  SELECT * INTO e FROM public.entregas WHERE id = _entrega;
  IF NOT FOUND THEN RAISE EXCEPTION 'entrega nao encontrada'; END IF;

  IF NOT (public.is_staff() OR EXISTS (
            SELECT 1 FROM public.projects p
             WHERE p.id = e.project_id AND p.client_id = public.my_client_id())) THEN
    RAISE EXCEPTION 'sem acesso a esta entrega' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF e.situacao <> 'aguardando' THEN
    RAISE EXCEPTION 'esta entrega ja foi decidida em %', e.decidida_em;
  END IF;

  IF NOT _aprovar AND COALESCE(trim(_observacao), '') = '' THEN
    RAISE EXCEPTION 'diga o que precisa ser ajustado';
  END IF;

  nova := CASE WHEN _aprovar THEN 'aprovado' ELSE 'ajuste' END::public.aceite_situacao;

  SELECT COALESCE(NULLIF(trim(full_name), ''), email) INTO quem
    FROM public.profiles WHERE id = auth.uid();

  UPDATE public.entregas
     SET situacao = nova,
         decidida_em = now(),
         decidida_por = auth.uid(),
         decidida_por_nome = quem,
         decidida_por_email = public.meu_email(),
         observacao_cliente = NULLIF(trim(_observacao), ''),
         updated_at = now()
   WHERE id = _entrega;

  RETURN nova;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.decidir_entrega(uuid, boolean, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.decidir_entrega(uuid, boolean, text) TO authenticated;

-- Pedido de ajuste vira a próxima versão, preservando o histórico da anterior.
CREATE OR REPLACE FUNCTION public.reenviar_entrega(_entrega uuid, _resultado text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  e    public.entregas%ROWTYPE;
  nova uuid;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'apenas a equipe reenvia entrega' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO e FROM public.entregas WHERE id = _entrega;
  IF NOT FOUND THEN RAISE EXCEPTION 'entrega nao encontrada'; END IF;

  INSERT INTO public.entregas
    (project_id, task_id, titulo, descricao, resultado, versao, enviada_por)
  VALUES
    (e.project_id, e.task_id, e.titulo, e.descricao,
     COALESCE(_resultado, e.resultado), e.versao + 1, auth.uid())
  RETURNING id INTO nova;

  RETURN nova;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.reenviar_entrega(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.reenviar_entrega(uuid, text) TO authenticated;

DROP TRIGGER IF EXISTS ao_mudar_entrega ON public.entregas;
CREATE TRIGGER ao_mudar_entrega BEFORE UPDATE ON public.entregas
FOR EACH ROW EXECUTE FUNCTION public.financeiro_touch();

-- ---------------------------------------------------------------
-- Rentabilidade por cliente
-- ---------------------------------------------------------------
-- A pergunta que decide preço: este cliente paga o que custa atendê-lo?
--
-- Receita é o que já foi faturado. Custo é o das horas orçadas nos cards
-- concluídos — o mesmo número que vira dívida com quem executa, então as duas
-- pontas falam a mesma língua.
CREATE OR REPLACE VIEW public.rentabilidade_cliente
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.nome,
  COALESCE((SELECT sum(r.valor) FROM public.recebimentos r
             WHERE r.client_id = c.id AND r.situacao IN ('emitido', 'pago')), 0) AS faturado,
  COALESCE((SELECT sum(r.valor_pago) FROM public.recebimentos r
             WHERE r.client_id = c.id AND r.situacao = 'pago'), 0)               AS recebido,
  COALESCE((SELECT sum(r.valor) FROM public.recebimentos r
             WHERE r.client_id = c.id AND r.situacao = 'emitido'), 0)            AS em_aberto,
  COALESCE((
    SELECT sum(COALESCE(pr.valor_hora_dev, col.valor_hora, 0) * t.horas_estimadas)
      FROM public.project_tasks t
      JOIN public.projects pr ON pr.id = t.project_id
      LEFT JOIN public.colaboradores col ON col.profile_id = t.responsavel_id
     WHERE pr.client_id = c.id AND t.status = 'done'
  ), 0)                                                                          AS custo_execucao,
  COALESCE((
    SELECT sum(t.horas_estimadas)
      FROM public.project_tasks t
      JOIN public.projects pr ON pr.id = t.project_id
     WHERE pr.client_id = c.id AND t.status = 'done'
  ), 0)                                                                          AS horas_entregues
FROM public.clients c
WHERE public.is_staff()
  AND (EXISTS (SELECT 1 FROM public.recebimentos r WHERE r.client_id = c.id)
       OR EXISTS (SELECT 1 FROM public.projects p WHERE p.client_id = c.id));

GRANT SELECT ON public.rentabilidade_cliente TO authenticated;
REVOKE ALL ON public.rentabilidade_cliente FROM anon;
