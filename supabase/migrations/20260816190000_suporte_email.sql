-- Integração de e-mail do suporte.
--
-- O banco monta a fila de envio; quem despacha é a aplicação, para o provedor
-- de e-mail poder ser trocado sem mexer no esquema.
--
-- Encadeamento das respostas: cada chamado ganha um token. O endereço de
-- resposta fica no formato suporte+t<numero>-<token>@dominio, e o webhook de
-- entrada usa isso para saber a que chamado a resposta pertence. O token evita
-- que alguém poste em um chamado alheio só adivinhando o número.

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS reply_token text NOT NULL DEFAULT encode(gen_random_bytes(9), 'hex');

CREATE INDEX IF NOT EXISTS tickets_reply_token ON public.tickets (reply_token);

-- Endereço de resposta do chamado.
CREATE OR REPLACE FUNCTION public.endereco_resposta(_ticket uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT split_part(COALESCE(i.email, 'suporte@absolutionsconsultoria.com.br'), '@', 1)
         || '+t' || t.numero || '-' || t.reply_token || '@'
         || split_part(COALESCE(i.email, 'suporte@absolutionsconsultoria.com.br'), '@', 2)
    FROM public.tickets t
    LEFT JOIN public.support_inboxes i ON i.id = t.inbox_id
   WHERE t.id = _ticket;
$fn$;

-- Quem deve receber a atualização: solicitante e cópias, menos quem escreveu.
CREATE OR REPLACE FUNCTION public.destinatarios_do_ticket(_ticket uuid, _excluir text)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(array_agg(DISTINCT e), '{}')
    FROM (
      SELECT lower(t.solicitante_email) AS e FROM public.tickets t WHERE t.id = _ticket
      UNION
      SELECT lower(w.email) FROM public.ticket_watchers w WHERE w.ticket_id = _ticket
    ) todos
   WHERE e IS NOT NULL AND e <> '' AND e IS DISTINCT FROM lower(COALESCE(_excluir, ''));
$fn$;

-- Toda mensagem pública entra na fila de envio.
CREATE OR REPLACE FUNCTION public.enfileirar_email_do_ticket()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t     public.tickets%ROWTYPE;
  para  text[];
BEGIN
  IF NEW.tipo <> 'publica' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO t FROM public.tickets WHERE id = NEW.ticket_id;
  para := public.destinatarios_do_ticket(NEW.ticket_id, NEW.autor_email);

  IF array_length(para, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.ticket_email_outbox (ticket_id, message_id, destinatarios, assunto, corpo)
  VALUES (
    NEW.ticket_id,
    NEW.id,
    para,
    '[#' || t.numero || '] ' || t.assunto,
    NEW.corpo
  );

  RETURN NEW;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.enfileirar_email_do_ticket() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.destinatarios_do_ticket(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.endereco_resposta(uuid) TO authenticated;

CREATE TRIGGER ao_publicar_mensagem_enfileira_email
AFTER INSERT ON public.ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.enfileirar_email_do_ticket();

-- ---------------------------------------------------------------
-- Entrada: transforma uma resposta recebida por e-mail em mensagem
-- ---------------------------------------------------------------
-- Chamada pelo webhook do provedor. Resolve o chamado pelo token do endereço,
-- registra a mensagem e, se o remetente ainda não acompanhava, coloca em cópia.
CREATE OR REPLACE FUNCTION public.registrar_resposta_por_email(
  _numero int,
  _token text,
  _de_email text,
  _de_nome text,
  _corpo text,
  _message_id text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t   public.tickets%ROWTYPE;
  msg uuid;
BEGIN
  SELECT * INTO t FROM public.tickets WHERE numero = _numero AND reply_token = _token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chamado nao encontrado para o token informado';
  END IF;

  -- Mesma mensagem entregue duas vezes pelo provedor não vira duplicata.
  IF _message_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ticket_messages WHERE email_message_id = _message_id
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.ticket_messages (ticket_id, tipo, canal, corpo, autor_nome, autor_email, email_message_id)
  VALUES (t.id, 'publica', 'email', _corpo, _de_nome, lower(_de_email), _message_id)
  RETURNING id INTO msg;

  -- Quem respondeu passa a acompanhar, se ainda não acompanhava.
  IF lower(_de_email) <> lower(t.solicitante_email) THEN
    INSERT INTO public.ticket_watchers (ticket_id, email, nome)
    VALUES (t.id, lower(_de_email), _de_nome)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN msg;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.registrar_resposta_por_email(int, text, text, text, text, text)
  FROM anon, public, authenticated;
