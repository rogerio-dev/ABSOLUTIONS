-- Deixa o webhook despachar a notificação que ele mesmo gerou.
--
-- Sem isso, a resposta do cliente chega, vira mensagem e enfileira o aviso para
-- a equipe — mas o aviso só sai quando alguém abre a tela de suporte. Ou seja,
-- o time descobriria a resposta justamente entrando no sistema, que é o que a
-- notificação deveria evitar.
--
-- As funções de fila existentes exigem sessão de usuário (is_staff, watchers).
-- Estas aqui são a versão para serviço: mesmo segredo do webhook, e limitadas
-- ao chamado que acabou de receber a resposta.

CREATE OR REPLACE FUNCTION public.emails_pendentes_de_webhook(_segredo text, _ticket uuid)
RETURNS TABLE (
  id uuid,
  ticket_numero int,
  assunto text,
  corpo text,
  destinatarios text[],
  responder_para text,
  autor_nome text,
  cliente text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.segredo_confere('webhook_email', _segredo) THEN
    RAISE EXCEPTION 'segredo do webhook invalido' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    SELECT o.id, t.numero, o.assunto, o.corpo, o.destinatarios,
           public.endereco_resposta(t.id), m.autor_nome, c.nome
      FROM public.ticket_email_outbox o
      JOIN public.tickets t ON t.id = o.ticket_id
      JOIN public.clients c ON c.id = t.client_id
      LEFT JOIN public.ticket_messages m ON m.id = o.message_id
     WHERE o.enviado_em IS NULL
       AND o.tentativas < 5
       AND o.ticket_id = _ticket
     ORDER BY o.created_at
     LIMIT 10;
END; $fn$;

CREATE OR REPLACE FUNCTION public.marcar_email_de_webhook(_segredo text, _id uuid, _erro text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.segredo_confere('webhook_email', _segredo) THEN
    RAISE EXCEPTION 'segredo do webhook invalido' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public.marcar_email(_id, _erro);
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.emails_pendentes_de_webhook(text, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.marcar_email_de_webhook(text, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.emails_pendentes_de_webhook(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_email_de_webhook(text, uuid, text) TO anon, authenticated;
