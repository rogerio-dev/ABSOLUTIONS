-- Ajustes para o envio de e-mail sair de verdade.
--
-- 1. Quando quem escreve não é da equipe, a caixa de atendimento entra como
--    destinatária — senão o time só descobre a resposta abrindo o sistema.
-- 2. Funções para a aplicação consumir a fila sem precisar da chave de serviço:
--    são SECURITY DEFINER e só devolvem o que o chamador já teria direito de ver.

-- ---------------------------------------------------------------
-- Destinatários passam a considerar quem escreveu
-- ---------------------------------------------------------------
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
     WHERE r.user_id = NEW.autor_id AND r.role IN ('admin', 'interno')
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

-- ---------------------------------------------------------------
-- Consumo da fila pela aplicação
-- ---------------------------------------------------------------
-- Devolve os e-mails pendentes de um chamado, com tudo que o remetente precisa.
-- Só entrega se o chamador for da equipe ou tiver acesso ao chamado.
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
  SELECT o.id,
         t.numero,
         o.assunto,
         o.corpo,
         o.destinatarios,
         public.endereco_resposta(t.id),
         m.autor_nome,
         c.nome
    FROM public.ticket_email_outbox o
    JOIN public.tickets t ON t.id = o.ticket_id
    JOIN public.clients c ON c.id = t.client_id
    LEFT JOIN public.ticket_messages m ON m.id = o.message_id
   WHERE o.enviado_em IS NULL
     AND o.tentativas < 5
     AND (_ticket IS NULL OR o.ticket_id = _ticket)
     AND (public.is_staff()
          OR (t.client_id = public.my_client_id() AND public.meu_suporte_habilitado())
          OR public.acompanho_ticket(t.id))
   ORDER BY o.created_at
   LIMIT GREATEST(_limite, 1);
$fn$;

-- Marca o resultado da tentativa de envio.
CREATE OR REPLACE FUNCTION public.marcar_email(_id uuid, _erro text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF _erro IS NULL THEN
    UPDATE public.ticket_email_outbox
       SET enviado_em = now(), erro = NULL, tentativas = tentativas + 1
     WHERE id = _id AND enviado_em IS NULL;
  ELSE
    UPDATE public.ticket_email_outbox
       SET erro = left(_erro, 500), tentativas = tentativas + 1
     WHERE id = _id AND enviado_em IS NULL;
  END IF;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.emails_pendentes(uuid, int) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.marcar_email(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.emails_pendentes(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_email(uuid, text) TO authenticated;
