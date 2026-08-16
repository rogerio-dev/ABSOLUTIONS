-- Comentários com menção por e-mail nas tarefas do kanban.
--
-- Mencionar alguém pelo e-mail transforma essa pessoa em participante da tarefa.
-- O acesso não depende de ela já ter conta: a permissão casa pelo e-mail
-- autenticado, então basta criar conta com aquele endereço que a tarefa aparece.
--
-- O participante externo enxerga APENAS a tarefa em que foi mencionado e os
-- comentários dela. Não vê o projeto, o cliente, nem as demais tarefas.

-- ---------------------------------------------------------------
-- Estrutura
-- ---------------------------------------------------------------

CREATE TABLE public.task_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  email text NOT NULL,
  convidado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX task_participants_unico ON public.task_participants (task_id, lower(email));
CREATE INDEX task_participants_email ON public.task_participants (lower(email));

CREATE TABLE public.comment_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.task_comments(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comment_mentions_comment ON public.comment_mentions (comment_id);
CREATE INDEX comment_mentions_email ON public.comment_mentions (lower(email));

-- Editar e apagar o próprio comentário exige saber quando ele mudou.
ALTER TABLE public.task_comments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------
-- Funções de autorização
-- ---------------------------------------------------------------

-- E-mail do usuário autenticado, em minúsculas.
CREATE OR REPLACE FUNCTION public.meu_email()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lower(email) FROM auth.users WHERE id = auth.uid();
$$;

-- Fui mencionado nesta tarefa?
CREATE OR REPLACE FUNCTION public.sou_participante(_task uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_participants p
    WHERE p.task_id = _task AND lower(p.email) = public.meu_email()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.meu_email() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.sou_participante(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.meu_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sou_participante(uuid) TO authenticated;

-- ---------------------------------------------------------------
-- Políticas
-- ---------------------------------------------------------------

ALTER TABLE public.task_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_mentions ENABLE ROW LEVEL SECURITY;

-- Participantes: a equipe gerencia; o convidado só enxerga o próprio convite.
CREATE POLICY "participantes staff all" ON public.task_participants FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "participantes ve o proprio" ON public.task_participants FOR SELECT TO authenticated
  USING (lower(email) = public.meu_email());

-- Menções: visíveis a quem já pode ler o comentário.
CREATE POLICY "mencoes staff all" ON public.comment_mentions FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "mencoes leitura" ON public.comment_mentions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.task_comments c
    WHERE c.id = comment_id
      AND (public.sou_participante(c.task_id)
           OR (public.client_of_task(c.task_id) = public.my_client_id()
               AND public.task_visivel_cliente(c.task_id)))
  ));

-- A tarefa em que fui mencionado fica visível para mim.
CREATE POLICY "tasks participante read" ON public.project_tasks FOR SELECT TO authenticated
  USING (public.sou_participante(id));

-- Comentários da tarefa em que fui mencionado: posso ler e responder.
CREATE POLICY "comments participante read" ON public.task_comments FOR SELECT TO authenticated
  USING (public.sou_participante(task_id));
CREATE POLICY "comments participante insert" ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.sou_participante(task_id));

-- Cada um edita e apaga o que escreveu.
CREATE POLICY "comments autor update" ON public.task_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "comments autor delete" ON public.task_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid());

-- ---------------------------------------------------------------
-- Registrar a menção já cria o participante
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.registrar_participante_da_mencao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _task uuid;
BEGIN
  SELECT task_id INTO _task FROM public.task_comments WHERE id = NEW.comment_id;
  IF _task IS NOT NULL THEN
    INSERT INTO public.task_participants (task_id, email, convidado_por)
    VALUES (_task, lower(NEW.email), auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.registrar_participante_da_mencao() FROM anon, public, authenticated;

CREATE TRIGGER ao_mencionar_vira_participante
AFTER INSERT ON public.comment_mentions
FOR EACH ROW EXECUTE FUNCTION public.registrar_participante_da_mencao();
