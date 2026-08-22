-- Autorização do webhook de entrada sem chave de serviço.
--
-- O caminho óbvio seria o webhook chamar o banco com a service_role key. Só que
-- essa chave ignora todas as políticas de RLS do projeto inteiro: se o ambiente
-- da Railway vazasse, vazaria tudo. E o webhook precisa de uma única operação.
--
-- Então ele continua usando a chave publishable (que já é pública por design) e
-- prova quem é com um segredo compartilhado. O segredo fica guardado como hash,
-- em tabela que ninguém alcança pela API, e é conferido dentro de uma função
-- SECURITY DEFINER. O pior caso de um vazamento aqui é alguém conseguir postar
-- resposta em um chamado cujo token ele já teria que conhecer.

CREATE TABLE IF NOT EXISTS public.app_segredos (
  nome       text PRIMARY KEY,
  hash       text NOT NULL,
  atualizado timestamptz NOT NULL DEFAULT now()
);

-- RLS ligado e nenhuma política: a tabela fica invisível pela API REST.
-- Só funções SECURITY DEFINER (e o dono do banco) enxergam o conteúdo.
ALTER TABLE public.app_segredos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_segredos FROM anon, authenticated;

COMMENT ON TABLE public.app_segredos IS
  'Segredos compartilhados com serviços externos, guardados como sha256. Nunca legível pela API.';

-- Grava ou troca um segredo. Executada por quem administra o banco.
CREATE OR REPLACE FUNCTION public.definir_segredo(_nome text, _valor text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  INSERT INTO public.app_segredos (nome, hash)
  VALUES (_nome, encode(sha256(convert_to(_valor, 'UTF8')), 'hex'))
  ON CONFLICT (nome) DO UPDATE
    SET hash = EXCLUDED.hash, atualizado = now();
$fn$;

REVOKE EXECUTE ON FUNCTION public.definir_segredo(text, text) FROM anon, public, authenticated;

-- Confere o segredo apresentado. Compara hashes, não os valores.
CREATE OR REPLACE FUNCTION public.segredo_confere(_nome text, _valor text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.app_segredos s
     WHERE s.nome = _nome
       AND s.hash = encode(sha256(convert_to(COALESCE(_valor, ''), 'UTF8')), 'hex')
  );
$fn$;

REVOKE EXECUTE ON FUNCTION public.segredo_confere(text, text) FROM anon, public, authenticated;

-- ---------------------------------------------------------------
-- Porta de entrada do webhook
-- ---------------------------------------------------------------
-- Única função da integração de e-mail exposta ao papel anon, e só faz uma
-- coisa: registrar resposta em um chamado cujo token o chamador já conhece.
CREATE OR REPLACE FUNCTION public.registrar_resposta_de_webhook(
  _segredo    text,
  _numero     int,
  _token      text,
  _de_email   text,
  _de_nome    text,
  _corpo      text,
  _message_id text
) RETURNS TABLE (mensagem_id uuid, ticket_id uuid, situacao text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.segredo_confere('webhook_email', _segredo) THEN
    RAISE EXCEPTION 'segredo do webhook invalido' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    SELECT * FROM public.registrar_resposta_por_email(
      _numero, _token, _de_email, _de_nome, _corpo, _message_id
    );
END; $fn$;

REVOKE EXECUTE ON FUNCTION
  public.registrar_resposta_de_webhook(text, int, text, text, text, text, text)
  FROM public;
GRANT EXECUTE ON FUNCTION
  public.registrar_resposta_de_webhook(text, int, text, text, text, text, text)
  TO anon, authenticated;
