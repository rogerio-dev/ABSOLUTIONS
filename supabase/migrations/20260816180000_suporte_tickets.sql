-- Sistema de tickets de suporte.
--
-- Decisões que sustentam o desenho:
--   * SLA é matriz cliente x criticidade, não um número único por cliente.
--   * O relógio conta apenas horário comercial e PAUSA enquanto o ticket
--     aguarda o cliente — sem isso a métrica pune atraso que não é nosso.
--   * Mensagens separam resposta pública de nota interna, para a equipe
--     discutir o caso sem o cliente ver.
--   * Quem acompanha (cópia) é identificado por e-mail, então funciona para
--     gente que não tem conta na plataforma.

-- ---------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------
CREATE TYPE public.ticket_status AS ENUM (
  'novo', 'em_atendimento', 'aguardando_cliente', 'resolvido', 'fechado'
);
CREATE TYPE public.ticket_prioridade AS ENUM ('critica', 'alta', 'media', 'baixa');
CREATE TYPE public.ticket_canal AS ENUM ('portal', 'email', 'interno');
CREATE TYPE public.mensagem_tipo AS ENUM ('publica', 'nota_interna', 'sistema');

-- ---------------------------------------------------------------
-- Caixas de atendimento
-- ---------------------------------------------------------------
CREATE TABLE public.support_inboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE,
  email text,
  descricao text,
  padrao boolean NOT NULL DEFAULT false,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX support_inboxes_uma_padrao ON public.support_inboxes (padrao) WHERE padrao;

-- ---------------------------------------------------------------
-- Política de SLA e horário comercial
-- ---------------------------------------------------------------
CREATE TABLE public.sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  fuso text NOT NULL DEFAULT 'America/Sao_Paulo',
  dias_uteis int[] NOT NULL DEFAULT '{1,2,3,4,5}',   -- 1=segunda … 7=domingo
  hora_inicio time NOT NULL DEFAULT '08:00',
  hora_fim time NOT NULL DEFAULT '18:00',
  conta_so_em_horario_comercial boolean NOT NULL DEFAULT true,
  padrao boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sla_policies_uma_padrao ON public.sla_policies (padrao) WHERE padrao;

CREATE TABLE public.sla_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.sla_policies(id) ON DELETE CASCADE,
  prioridade public.ticket_prioridade NOT NULL,
  primeira_resposta_min int NOT NULL,
  resolucao_min int NOT NULL,
  UNIQUE (policy_id, prioridade)
);

-- ---------------------------------------------------------------
-- Habilitação do suporte por cliente
-- ---------------------------------------------------------------
CREATE TABLE public.client_support (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  habilitado boolean NOT NULL DEFAULT false,
  inbox_id uuid REFERENCES public.support_inboxes(id),
  sla_policy_id uuid REFERENCES public.sla_policies(id),
  observacoes text,
  habilitado_por uuid,
  habilitado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------
CREATE TABLE public.ticket_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE,
  descricao text,
  ordem int NOT NULL DEFAULT 0,
  ativa boolean NOT NULL DEFAULT true
);

-- ---------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------
CREATE SEQUENCE public.ticket_numero_seq START 1000;

CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero int NOT NULL UNIQUE DEFAULT nextval('public.ticket_numero_seq'),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  inbox_id uuid REFERENCES public.support_inboxes(id),
  categoria_id uuid REFERENCES public.ticket_categorias(id),

  assunto text NOT NULL,
  descricao text,
  prioridade public.ticket_prioridade NOT NULL DEFAULT 'media',
  status public.ticket_status NOT NULL DEFAULT 'novo',
  canal public.ticket_canal NOT NULL DEFAULT 'portal',

  solicitante_user_id uuid,
  solicitante_nome text,
  solicitante_email text NOT NULL,

  responsavel_id uuid,

  -- Relógio do SLA
  aberto_em timestamptz NOT NULL DEFAULT now(),
  prazo_primeira_resposta timestamptz,
  prazo_resolucao timestamptz,
  primeira_resposta_em timestamptz,
  resolvido_em timestamptz,
  fechado_em timestamptz,
  pausado_desde timestamptz,
  minutos_pausados int NOT NULL DEFAULT 0,

  reaberturas int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tickets_cliente ON public.tickets (client_id, status);
CREATE INDEX tickets_caixa ON public.tickets (inbox_id, status);
CREATE INDEX tickets_responsavel ON public.tickets (responsavel_id) WHERE responsavel_id IS NOT NULL;
CREATE INDEX tickets_solicitante ON public.tickets (lower(solicitante_email));

-- ---------------------------------------------------------------
-- Mensagens e acompanhantes
-- ---------------------------------------------------------------
CREATE TABLE public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  tipo public.mensagem_tipo NOT NULL DEFAULT 'publica',
  canal public.ticket_canal NOT NULL DEFAULT 'portal',
  corpo text NOT NULL,
  autor_id uuid,
  autor_nome text,
  autor_email text,
  email_message_id text,          -- cabeçalho Message-ID, para encadear respostas
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_messages_ticket ON public.ticket_messages (ticket_id, created_at);
CREATE INDEX ticket_messages_email_id ON public.ticket_messages (email_message_id) WHERE email_message_id IS NOT NULL;

CREATE TABLE public.ticket_watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  email text NOT NULL,
  nome text,
  adicionado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ticket_watchers_unico ON public.ticket_watchers (ticket_id, lower(email));
CREATE INDEX ticket_watchers_email ON public.ticket_watchers (lower(email));

-- Fila de e-mails a enviar. O envio em si é feito pela aplicação.
CREATE TABLE public.ticket_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.ticket_messages(id) ON DELETE CASCADE,
  destinatarios text[] NOT NULL,
  assunto text NOT NULL,
  corpo text NOT NULL,
  enviado_em timestamptz,
  erro text,
  tentativas int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_email_outbox_pendentes ON public.ticket_email_outbox (created_at) WHERE enviado_em IS NULL;

-- ---------------------------------------------------------------
-- Cálculo de prazo em horário comercial
-- ---------------------------------------------------------------
-- Caminha para frente consumindo apenas minutos dentro do expediente,
-- pulando fins de semana e o período noturno.
CREATE OR REPLACE FUNCTION public.prazo_util(_inicio timestamptz, _minutos int, _policy uuid)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p        public.sla_policies%ROWTYPE;
  agora    timestamp;
  restante int := GREATEST(_minutos, 0);
  fim_dia  timestamp;
  cabe     int;
BEGIN
  SELECT * INTO p FROM public.sla_policies WHERE id = _policy;
  IF NOT FOUND OR NOT p.conta_so_em_horario_comercial THEN
    RETURN _inicio + make_interval(mins => restante);
  END IF;

  agora := _inicio AT TIME ZONE p.fuso;

  FOR _ IN 1..400 LOOP   -- teto de segurança: ~1 ano de dias úteis
    IF NOT (EXTRACT(ISODOW FROM agora)::int = ANY (p.dias_uteis))
       OR agora::time >= p.hora_fim THEN
      agora := date_trunc('day', agora) + interval '1 day' + p.hora_inicio;
      CONTINUE;
    END IF;

    IF agora::time < p.hora_inicio THEN
      agora := date_trunc('day', agora) + p.hora_inicio;
    END IF;

    fim_dia := date_trunc('day', agora) + p.hora_fim;
    cabe := EXTRACT(EPOCH FROM (fim_dia - agora))::int / 60;

    IF restante <= cabe THEN
      RETURN (agora + make_interval(mins => restante)) AT TIME ZONE p.fuso;
    END IF;

    restante := restante - cabe;
    agora := date_trunc('day', agora) + interval '1 day' + p.hora_inicio;
  END LOOP;

  RETURN (agora) AT TIME ZONE p.fuso;
END; $$;

-- ---------------------------------------------------------------
-- Ao abrir o ticket: define caixa, política e prazos
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ticket_ao_abrir()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg    public.client_support%ROWTYPE;
  pol    uuid;
  alvo   public.sla_targets%ROWTYPE;
BEGIN
  SELECT * INTO cfg FROM public.client_support WHERE client_id = NEW.client_id;

  IF NEW.inbox_id IS NULL THEN
    NEW.inbox_id := COALESCE(cfg.inbox_id, (SELECT id FROM public.support_inboxes WHERE padrao LIMIT 1));
  END IF;

  pol := COALESCE(cfg.sla_policy_id, (SELECT id FROM public.sla_policies WHERE padrao LIMIT 1));

  SELECT * INTO alvo FROM public.sla_targets WHERE policy_id = pol AND prioridade = NEW.prioridade;
  IF FOUND THEN
    NEW.prazo_primeira_resposta := public.prazo_util(NEW.aberto_em, alvo.primeira_resposta_min, pol);
    NEW.prazo_resolucao         := public.prazo_util(NEW.aberto_em, alvo.resolucao_min, pol);
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER ao_abrir_ticket BEFORE INSERT ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.ticket_ao_abrir();

-- ---------------------------------------------------------------
-- Mudança de status: pausa e retoma o relógio de resolução
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ticket_ao_mudar_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pausados int;
  pol uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- entrou em espera pelo cliente: congela o relógio
    IF NEW.status = 'aguardando_cliente' AND OLD.status <> 'aguardando_cliente' THEN
      NEW.pausado_desde := now();

    -- saiu da espera: acumula o tempo parado e empurra o prazo na mesma medida
    ELSIF OLD.status = 'aguardando_cliente' AND NEW.status <> 'aguardando_cliente' THEN
      pausados := GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(OLD.pausado_desde, now())))::int / 60, 0);
      NEW.minutos_pausados := OLD.minutos_pausados + pausados;
      NEW.pausado_desde := NULL;
      SELECT COALESCE(cs.sla_policy_id, (SELECT id FROM public.sla_policies WHERE padrao LIMIT 1))
        INTO pol FROM public.client_support cs WHERE cs.client_id = NEW.client_id;
      IF NEW.prazo_resolucao IS NOT NULL AND pausados > 0 THEN
        NEW.prazo_resolucao := public.prazo_util(NEW.prazo_resolucao, pausados, pol);
      END IF;
    END IF;

    IF NEW.status = 'resolvido' AND OLD.status <> 'resolvido' THEN
      NEW.resolvido_em := now();
    END IF;
    IF NEW.status = 'fechado' AND OLD.status <> 'fechado' THEN
      NEW.fechado_em := now();
    END IF;
    IF OLD.status IN ('resolvido', 'fechado') AND NEW.status NOT IN ('resolvido', 'fechado') THEN
      NEW.reaberturas := OLD.reaberturas + 1;
      NEW.resolvido_em := NULL;
      NEW.fechado_em := NULL;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END; $$;

CREATE TRIGGER ao_mudar_status_ticket BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.ticket_ao_mudar_status();

-- ---------------------------------------------------------------
-- Mensagens movem o ticket automaticamente
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ticket_ao_receber_mensagem()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.tickets%ROWTYPE;
  eh_da_equipe boolean;
BEGIN
  IF NEW.tipo <> 'publica' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO t FROM public.tickets WHERE id = NEW.ticket_id;
  eh_da_equipe := NEW.autor_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.user_id = NEW.autor_id AND r.role IN ('admin', 'interno')
  );

  IF eh_da_equipe THEN
    -- primeira resposta da equipe carimba o SLA
    UPDATE public.tickets
       SET primeira_resposta_em = COALESCE(primeira_resposta_em, now()),
           status = CASE WHEN status = 'novo' THEN 'em_atendimento'::public.ticket_status ELSE status END,
           updated_at = now()
     WHERE id = NEW.ticket_id;
  ELSE
    -- resposta do cliente tira da espera e reabre o que já estava resolvido
    UPDATE public.tickets
       SET status = CASE
                      WHEN status IN ('aguardando_cliente') THEN 'em_atendimento'::public.ticket_status
                      WHEN status IN ('resolvido', 'fechado') THEN 'em_atendimento'::public.ticket_status
                      ELSE status
                    END,
           updated_at = now()
     WHERE id = NEW.ticket_id;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER ao_receber_mensagem AFTER INSERT ON public.ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.ticket_ao_receber_mensagem();

-- ---------------------------------------------------------------
-- Autorização
-- ---------------------------------------------------------------
-- Acompanho este ticket por ser o solicitante ou estar em cópia?
CREATE OR REPLACE FUNCTION public.acompanho_ticket(_ticket uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.ticket_watchers w
     WHERE w.ticket_id = _ticket AND lower(w.email) = public.meu_email()
  ) OR EXISTS (
    SELECT 1 FROM public.tickets t
     WHERE t.id = _ticket AND lower(t.solicitante_email) = public.meu_email()
  );
$fn$;

-- O suporte está liberado para o cliente do usuário logado?
CREATE OR REPLACE FUNCTION public.meu_suporte_habilitado()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.client_support cs
     WHERE cs.client_id = public.my_client_id() AND cs.habilitado
  );
$fn$;

REVOKE EXECUTE ON FUNCTION public.acompanho_ticket(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.meu_suporte_habilitado() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.prazo_util(timestamptz, int, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.acompanho_ticket(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.meu_suporte_habilitado() TO authenticated;
GRANT EXECUTE ON FUNCTION public.prazo_util(timestamptz, int, uuid) TO authenticated;

ALTER TABLE public.support_inboxes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_policies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_targets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_support      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_categorias   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_watchers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_email_outbox ENABLE ROW LEVEL SECURITY;

-- Catálogo: a equipe administra, todo autenticado consegue ler o que precisa.
CREATE POLICY "caixas staff"       ON public.support_inboxes   FOR ALL    TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "caixas leitura"     ON public.support_inboxes   FOR SELECT TO authenticated USING (ativa);
CREATE POLICY "sla staff"          ON public.sla_policies      FOR ALL    TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "sla alvos staff"    ON public.sla_targets       FOR ALL    TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "categorias staff"   ON public.ticket_categorias FOR ALL    TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "categorias leitura" ON public.ticket_categorias FOR SELECT TO authenticated USING (ativa);

CREATE POLICY "habilitacao staff" ON public.client_support FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "habilitacao propria" ON public.client_support FOR SELECT TO authenticated
  USING (client_id = public.my_client_id());

-- Tickets
CREATE POLICY "tickets staff" ON public.tickets FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "tickets do meu cliente" ON public.tickets FOR SELECT TO authenticated
  USING (client_id = public.my_client_id() AND public.meu_suporte_habilitado());

CREATE POLICY "tickets que acompanho" ON public.tickets FOR SELECT TO authenticated
  USING (public.acompanho_ticket(id));

-- Abrir chamado exige suporte habilitado para o cliente do usuário.
CREATE POLICY "tickets cliente abre" ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (
    client_id = public.my_client_id()
    AND public.meu_suporte_habilitado()
    AND lower(solicitante_email) = public.meu_email()
    AND status = 'novo'
  );

-- O cliente pode encerrar o próprio chamado.
CREATE POLICY "tickets cliente encerra" ON public.tickets FOR UPDATE TO authenticated
  USING (client_id = public.my_client_id() AND public.meu_suporte_habilitado())
  WITH CHECK (client_id = public.my_client_id());

-- Mensagens: nota interna nunca chega ao cliente.
CREATE POLICY "mensagens staff" ON public.ticket_messages FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "mensagens visiveis ao cliente" ON public.ticket_messages FOR SELECT TO authenticated
  USING (
    tipo <> 'nota_interna'
    AND EXISTS (
      SELECT 1 FROM public.tickets t
       WHERE t.id = ticket_id
         AND ((t.client_id = public.my_client_id() AND public.meu_suporte_habilitado())
              OR public.acompanho_ticket(t.id))
    )
  );

CREATE POLICY "mensagens cliente responde" ON public.ticket_messages FOR INSERT TO authenticated
  WITH CHECK (
    tipo = 'publica'
    AND autor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tickets t
       WHERE t.id = ticket_id
         AND ((t.client_id = public.my_client_id() AND public.meu_suporte_habilitado())
              OR public.acompanho_ticket(t.id))
    )
  );

-- Acompanhantes em cópia
CREATE POLICY "acompanhantes staff" ON public.ticket_watchers FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "acompanhantes leitura" ON public.ticket_watchers FOR SELECT TO authenticated
  USING (public.acompanho_ticket(ticket_id)
         OR EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.client_id = public.my_client_id()));
CREATE POLICY "acompanhantes cliente adiciona" ON public.ticket_watchers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tickets t
     WHERE t.id = ticket_id AND t.client_id = public.my_client_id() AND public.meu_suporte_habilitado()
  ));

-- A fila de e-mail é assunto interno.
CREATE POLICY "outbox staff" ON public.ticket_email_outbox FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ---------------------------------------------------------------
-- Dados iniciais
-- ---------------------------------------------------------------
INSERT INTO public.support_inboxes (nome, slug, email, descricao, padrao)
VALUES ('Suporte Fluig', 'suporte', 'suporte@absolutionsconsultoria.com.br',
        'Caixa padrão para chamados de sustentação e dúvidas.', true);

INSERT INTO public.sla_policies (nome, padrao)
VALUES ('SLA padrão — comercial das 8h às 18h', true);

-- Alvos por criticidade, em minutos de horário comercial.
INSERT INTO public.sla_targets (policy_id, prioridade, primeira_resposta_min, resolucao_min)
SELECT p.id, v.prioridade::public.ticket_prioridade, v.pr, v.res
FROM public.sla_policies p,
     (VALUES ('critica',  60,   240),
             ('alta',    240,  1440),
             ('media',   480,  2880),
             ('baixa',  1440,  4800))
     AS v(prioridade, pr, res)
WHERE p.padrao;

INSERT INTO public.ticket_categorias (nome, slug, descricao, ordem) VALUES
  ('Erro em processo',        'erro-processo',   'Workflow ou formulário com comportamento incorreto.', 1),
  ('Erro em integração',      'erro-integracao', 'Falha na comunicação com RM, Protheus ou Datasul.',   2),
  ('Dúvida de uso',           'duvida',          'Como fazer algo na plataforma.',                      3),
  ('Solicitação de melhoria', 'melhoria',        'Ajuste em processo existente.',                       4),
  ('Novo desenvolvimento',    'novo',            'Processo ou automação que ainda não existe.',         5),
  ('Acesso e permissões',     'acesso',          'Usuários, papéis e visibilidade no Fluig.',           6),
  ('Performance',             'performance',     'Lentidão ou consumo excessivo de recursos.',          7);
