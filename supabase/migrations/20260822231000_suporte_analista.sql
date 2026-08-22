-- Perfil de analista, responsável pelo chamado e status "em espera".
--
-- Três mudanças que andam juntas:
--
-- 1. Analista é quem trata chamados sem ver o CRM. Por isso as políticas do
--    suporte deixam de usar is_staff() e passam a usar is_suporte(). O que dá
--    acesso a funil, contratos e financeiro continua exigindo is_staff().
--
-- 2. O chamado passa a ter dono. A fila mostra tudo, e o analista assume ao se
--    colocar como responsável — quem está atendendo o quê deixa de ser
--    combinado no boca a boca.
--
-- 3. 'em_espera' separa "parei porque falta resposta do cliente" de "parei
--    porque dependo de outra área". A primeira pausa o SLA; a segunda não,
--    porque a demora continua sendo nossa.

-- ---------------------------------------------------------------
-- Quem é quem
-- ---------------------------------------------------------------
-- Acesso ao módulo de suporte.
CREATE OR REPLACE FUNCTION public.is_suporte()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = auth.uid() AND role IN ('admin', 'interno', 'analista')
  );
$fn$;

-- Analista puro: usa para esconder o CRM sem precisar negar rota a rota.
CREATE OR REPLACE FUNCTION public.is_analista()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.has_role(auth.uid(), 'analista') AND NOT public.is_staff();
$fn$;

REVOKE EXECUTE ON FUNCTION public.is_suporte() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_analista() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_suporte() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_analista() TO authenticated;

-- Agentes que podem receber um chamado. Vai para o seletor de responsável.
-- É SECURITY DEFINER porque o analista não lê a tabela de perfis inteira.
CREATE OR REPLACE FUNCTION public.agentes_de_suporte()
RETURNS TABLE (id uuid, nome text, email text, papel public.app_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT p.id,
         COALESCE(NULLIF(trim(p.full_name), ''), p.email) AS nome,
         p.email,
         (SELECT r.role FROM public.user_roles r
           WHERE r.user_id = p.id
           ORDER BY CASE r.role WHEN 'admin' THEN 1 WHEN 'interno' THEN 2 ELSE 3 END
           LIMIT 1) AS papel
    FROM public.profiles p
   WHERE EXISTS (
     SELECT 1 FROM public.user_roles r
      WHERE r.user_id = p.id AND r.role IN ('admin', 'interno', 'analista')
   )
     AND public.is_suporte()
   ORDER BY nome;
$fn$;

REVOKE EXECUTE ON FUNCTION public.agentes_de_suporte() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.agentes_de_suporte() TO authenticated;

-- ---------------------------------------------------------------
-- Responsável
-- ---------------------------------------------------------------
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS assumido_em timestamptz;

COMMENT ON COLUMN public.tickets.responsavel_id IS
  'Analista que assumiu o chamado. Nulo significa que ele está na caixa geral, à espera de dono.';

CREATE INDEX IF NOT EXISTS tickets_sem_dono
  ON public.tickets (status) WHERE responsavel_id IS NULL;

-- Troca de responsável vira registro no histórico. Sem isso, "quem pegou e
-- largou este chamado" só existiria na memória de quem estava por perto.
CREATE OR REPLACE FUNCTION public.ticket_ao_mudar_responsavel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  nome_novo text;
  nome_ante text;
  quem      text;
BEGIN
  IF NEW.responsavel_id IS NOT DISTINCT FROM OLD.responsavel_id THEN
    RETURN NEW;
  END IF;

  NEW.assumido_em := CASE WHEN NEW.responsavel_id IS NULL THEN NULL ELSE now() END;

  SELECT COALESCE(NULLIF(trim(full_name), ''), email) INTO nome_novo
    FROM public.profiles WHERE id = NEW.responsavel_id;
  SELECT COALESCE(NULLIF(trim(full_name), ''), email) INTO nome_ante
    FROM public.profiles WHERE id = OLD.responsavel_id;
  SELECT COALESCE(NULLIF(trim(full_name), ''), email) INTO quem
    FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.ticket_messages (ticket_id, tipo, canal, corpo, autor_id, autor_nome)
  VALUES (
    NEW.id, 'sistema', 'interno',
    CASE
      WHEN NEW.responsavel_id IS NULL THEN 'Chamado devolvido à caixa geral por ' || COALESCE(quem, 'alguém') || '.'
      WHEN NEW.responsavel_id = auth.uid() THEN COALESCE(quem, 'Um analista') || ' assumiu o chamado.'
      WHEN OLD.responsavel_id IS NULL THEN 'Chamado atribuído a ' || COALESCE(nome_novo, 'outro analista') || '.'
      ELSE 'Responsável alterado de ' || COALESCE(nome_ante, '—') || ' para ' || COALESCE(nome_novo, '—') || '.'
    END,
    auth.uid(), quem
  );

  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS ao_mudar_responsavel ON public.tickets;
CREATE TRIGGER ao_mudar_responsavel BEFORE UPDATE OF responsavel_id ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.ticket_ao_mudar_responsavel();

-- ---------------------------------------------------------------
-- Analista conta como equipe nos gatilhos do chamado
-- ---------------------------------------------------------------
-- Sem isto, a resposta de um analista seria lida como resposta de cliente:
-- não carimbaria o SLA de primeira resposta e reabriria o próprio chamado.
CREATE OR REPLACE FUNCTION public.ticket_ao_receber_mensagem()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  eh_da_equipe boolean;
BEGIN
  IF NEW.tipo <> 'publica' THEN
    RETURN NEW;
  END IF;

  eh_da_equipe := NEW.autor_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.user_id = NEW.autor_id AND r.role IN ('admin', 'interno', 'analista')
  );

  IF eh_da_equipe THEN
    UPDATE public.tickets
       SET primeira_resposta_em = COALESCE(primeira_resposta_em, now()),
           status = CASE WHEN status = 'novo' THEN 'em_atendimento'::public.ticket_status ELSE status END,
           updated_at = now()
     WHERE id = NEW.ticket_id;
  ELSE
    -- Resposta do cliente tira da espera dele e reabre o que já estava
    -- resolvido. 'em_espera' fica de fora de propósito: a pendência é interna,
    -- e o cliente escrevendo não resolve o que trava do nosso lado.
    UPDATE public.tickets
       SET status = CASE
                      WHEN status IN ('aguardando_cliente', 'resolvido', 'fechado')
                        THEN 'em_atendimento'::public.ticket_status
                      ELSE status
                    END,
           updated_at = now()
     WHERE id = NEW.ticket_id;
    -- A contagem de reaberturas é do gatilho ao_mudar_status, que dispara neste
    -- mesmo UPDATE. Somar aqui contaria duas vezes.
  END IF;

  RETURN NEW;
END; $fn$;

CREATE OR REPLACE FUNCTION public.enfileirar_email_do_ticket()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t             public.tickets%ROWTYPE;
  para          text[];
  email_caixa   text;
  autor_e_staff boolean;
BEGIN
  IF NEW.tipo <> 'publica' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO t FROM public.tickets WHERE id = NEW.ticket_id;

  autor_e_staff := NEW.autor_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.user_id = NEW.autor_id AND r.role IN ('admin', 'interno', 'analista')
  );

  para := public.destinatarios_do_ticket(NEW.ticket_id, NEW.autor_email);

  -- Resposta vinda do cliente avisa a caixa de atendimento.
  IF NOT autor_e_staff THEN
    SELECT i.email INTO email_caixa FROM public.support_inboxes i WHERE i.id = t.inbox_id;
    IF email_caixa IS NOT NULL AND NOT (lower(email_caixa) = ANY (para)) THEN
      para := para || lower(email_caixa);
    END IF;
  END IF;

  IF array_length(para, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.ticket_email_outbox (ticket_id, message_id, destinatarios, assunto, corpo)
  VALUES (NEW.ticket_id, NEW.id, para, '[#' || t.numero || '] ' || t.assunto, NEW.corpo);

  RETURN NEW;
END; $fn$;

-- A fila de envio também é trabalho de analista.
CREATE OR REPLACE FUNCTION public.emails_pendentes(_ticket uuid DEFAULT NULL, _limite int DEFAULT 20)
RETURNS TABLE (
  id uuid,
  ticket_numero int,
  assunto text,
  corpo text,
  destinatarios text[],
  responder_para text,
  autor_nome text,
  cliente text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT o.id, t.numero, o.assunto, o.corpo, o.destinatarios,
         public.endereco_resposta(t.id), m.autor_nome, c.nome
    FROM public.ticket_email_outbox o
    JOIN public.tickets t ON t.id = o.ticket_id
    JOIN public.clients c ON c.id = t.client_id
    LEFT JOIN public.ticket_messages m ON m.id = o.message_id
   WHERE o.enviado_em IS NULL
     AND o.tentativas < 5
     AND (_ticket IS NULL OR o.ticket_id = _ticket)
     AND (public.is_suporte()
          OR (t.client_id = public.my_client_id() AND public.meu_suporte_habilitado())
          OR public.acompanho_ticket(t.id))
   ORDER BY o.created_at
   LIMIT GREATEST(_limite, 1);
$fn$;

REVOKE EXECUTE ON FUNCTION public.emails_pendentes(uuid, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.emails_pendentes(uuid, int) TO authenticated;

-- ---------------------------------------------------------------
-- Políticas: o suporte deixa de depender de is_staff()
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "tickets staff" ON public.tickets;
CREATE POLICY "tickets suporte" ON public.tickets FOR ALL TO authenticated
  USING (public.is_suporte()) WITH CHECK (public.is_suporte());

DROP POLICY IF EXISTS "mensagens staff" ON public.ticket_messages;
CREATE POLICY "mensagens suporte" ON public.ticket_messages FOR ALL TO authenticated
  USING (public.is_suporte()) WITH CHECK (public.is_suporte());

DROP POLICY IF EXISTS "acompanhantes staff" ON public.ticket_watchers;
CREATE POLICY "acompanhantes suporte" ON public.ticket_watchers FOR ALL TO authenticated
  USING (public.is_suporte()) WITH CHECK (public.is_suporte());

DROP POLICY IF EXISTS "outbox staff" ON public.ticket_email_outbox;
CREATE POLICY "outbox suporte" ON public.ticket_email_outbox FOR ALL TO authenticated
  USING (public.is_suporte()) WITH CHECK (public.is_suporte());

-- Configuração do suporte: analista lê, mas quem muda continua sendo a equipe.
DROP POLICY IF EXISTS "caixas leitura" ON public.support_inboxes;
CREATE POLICY "caixas leitura" ON public.support_inboxes FOR SELECT TO authenticated
  USING (ativa OR public.is_suporte());

DROP POLICY IF EXISTS "categorias leitura" ON public.ticket_categorias;
CREATE POLICY "categorias leitura" ON public.ticket_categorias FOR SELECT TO authenticated
  USING (ativa OR public.is_suporte());

DROP POLICY IF EXISTS "sla leitura suporte" ON public.sla_policies;
CREATE POLICY "sla leitura suporte" ON public.sla_policies FOR SELECT TO authenticated
  USING (public.is_suporte());

DROP POLICY IF EXISTS "sla alvos leitura suporte" ON public.sla_targets;
CREATE POLICY "sla alvos leitura suporte" ON public.sla_targets FOR SELECT TO authenticated
  USING (public.is_suporte());

DROP POLICY IF EXISTS "habilitacao leitura suporte" ON public.client_support;
CREATE POLICY "habilitacao leitura suporte" ON public.client_support FOR SELECT TO authenticated
  USING (public.is_suporte());

-- O analista precisa do nome da empresa no chamado, e só disso: leitura.
-- Funil, contratos e financeiro seguem atrás de is_staff().
DROP POLICY IF EXISTS "clients leitura suporte" ON public.clients;
CREATE POLICY "clients leitura suporte" ON public.clients FOR SELECT TO authenticated
  USING (public.is_suporte());

-- Para exibir o nome de quem respondeu e de quem é responsável.
DROP POLICY IF EXISTS "profiles leitura suporte" ON public.profiles;
CREATE POLICY "profiles leitura suporte" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_suporte());

DROP POLICY IF EXISTS "roles leitura suporte" ON public.user_roles;
CREATE POLICY "roles leitura suporte" ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_suporte());
