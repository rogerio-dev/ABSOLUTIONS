-- Recebimento de respostas por e-mail.
--
-- Problema que esta migração resolve: o endereço de resposta era montado no
-- domínio da caixa de atendimento (@absolutionsconsultoria.com.br), cujo MX
-- aponta para a KingHost. O provedor que recebe e chama o webhook é o Mailgun,
-- e ele só enxerga o que chega no domínio dele. A resposta nunca chegaria.
--
-- Agora a caixa guarda separadamente o domínio de entrada. O endereço visível
-- continua sendo o da caixa; o que muda é para onde a resposta é roteada.

ALTER TABLE public.support_inboxes
  ADD COLUMN IF NOT EXISTS dominio_entrada text;

COMMENT ON COLUMN public.support_inboxes.dominio_entrada IS
  'Domínio que recebe as respostas e aciona o webhook (o do provedor de e-mail). Vazio usa o domínio do próprio endereço da caixa.';

-- Endereço de resposta: parte local da caixa + token, no domínio de entrada.
CREATE OR REPLACE FUNCTION public.endereco_resposta(_ticket uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT split_part(COALESCE(i.email, 'suporte@absolutionsconsultoria.com.br'), '@', 1)
         || '+t' || t.numero || '-' || t.reply_token || '@'
         || COALESCE(
              NULLIF(i.dominio_entrada, ''),
              split_part(COALESCE(i.email, 'suporte@absolutionsconsultoria.com.br'), '@', 2)
            )
    FROM public.tickets t
    LEFT JOIN public.support_inboxes i ON i.id = t.inbox_id
   WHERE t.id = _ticket;
$fn$;

-- A dedupe por Message-Id é consultada a cada mensagem recebida.
CREATE INDEX IF NOT EXISTS ticket_messages_email_message_id
  ON public.ticket_messages (email_message_id)
  WHERE email_message_id IS NOT NULL;

-- ---------------------------------------------------------------
-- Registro da resposta recebida
-- ---------------------------------------------------------------
-- Diferenças para a versão anterior:
--   - devolve o id do chamado junto, para o webhook conseguir despachar a
--     notificação da equipe sem uma segunda consulta;
--   - ignora mensagem repetida e mensagem vinda da própria caixa, que é o que
--     evita laço quando um autorresponder do outro lado responde ao aviso;
--   - identifica quem respondeu: se o e-mail pertence a um usuário da
--     plataforma, a mensagem nasce com autor_id preenchido. Sem isso, resposta
--     de alguém da equipe chegando por e-mail era lida como resposta de
--     cliente, reabria o chamado e não carimbava o SLA de primeira resposta.
--
-- A reabertura de chamado resolvido e a saída da espera continuam vindo do
-- gatilho ao_receber_mensagem, que já trata isso para qualquer canal.
DROP FUNCTION IF EXISTS public.registrar_resposta_por_email(int, text, text, text, text, text);

CREATE FUNCTION public.registrar_resposta_por_email(
  _numero     int,
  _token      text,
  _de_email   text,
  _de_nome    text,
  _corpo      text,
  _message_id text
) RETURNS TABLE (mensagem_id uuid, ticket_id uuid, situacao text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t           public.tickets%ROWTYPE;
  msg         uuid;
  email_caixa text;
  autor       uuid;
  de          text := lower(trim(COALESCE(_de_email, '')));
BEGIN
  SELECT * INTO t FROM public.tickets WHERE numero = _numero AND reply_token = _token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chamado nao encontrado para o token informado'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Mesma mensagem entregue duas vezes pelo provedor não vira duplicata.
  IF _message_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ticket_messages WHERE email_message_id = _message_id
  ) THEN
    RETURN QUERY SELECT NULL::uuid, t.id, 'repetida'::text;
    RETURN;
  END IF;

  -- Resposta da própria caixa é eco: registrar criaria laço de notificação.
  SELECT lower(i.email) INTO email_caixa FROM public.support_inboxes i WHERE i.id = t.inbox_id;
  IF de = COALESCE(email_caixa, '') THEN
    RETURN QUERY SELECT NULL::uuid, t.id, 'eco'::text;
    RETURN;
  END IF;

  IF COALESCE(trim(_corpo), '') = '' THEN
    RETURN QUERY SELECT NULL::uuid, t.id, 'vazia'::text;
    RETURN;
  END IF;

  SELECT u.id INTO autor FROM auth.users u WHERE lower(u.email) = de LIMIT 1;

  INSERT INTO public.ticket_messages
    (ticket_id, tipo, canal, corpo, autor_id, autor_nome, autor_email, email_message_id)
  VALUES (t.id, 'publica', 'email', _corpo, autor,
          NULLIF(trim(COALESCE(_de_nome, '')), ''), de, _message_id)
  RETURNING id INTO msg;

  -- Quem respondeu passa a acompanhar, se ainda não acompanhava.
  IF de <> lower(COALESCE(t.solicitante_email, '')) THEN
    INSERT INTO public.ticket_watchers (ticket_id, email, nome)
    VALUES (t.id, de, NULLIF(trim(COALESCE(_de_nome, '')), ''))
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY SELECT msg, t.id, 'registrada'::text;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.registrar_resposta_por_email(int, text, text, text, text, text)
  FROM anon, public, authenticated;
