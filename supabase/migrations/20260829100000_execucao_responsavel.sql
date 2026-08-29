-- Liga o card do kanban a uma pessoa de verdade.
--
-- O responsável do card era texto livre: `responsavel_nome`, digitado à mão. E
-- toda a conta de execução do financeiro soma por `responsavel_id`, que nunca
-- era preenchido. O resultado é que a cadeia parecia pronta e não acumulava
-- nada — as horas concluídas ficavam presas em um nome que o banco não sabia
-- de quem era.
--
-- Nome digitado também não sobrevive à realidade: "Rogério", "Rogerio",
-- "rogério gadelha" e "Rog." são quatro pessoas diferentes para um banco de
-- dados, e a soma some sem ninguém perceber.

-- Comparar nome digitado exige ignorar acento, e `unaccent` não é IMMUTABLE —
-- o Postgres recusa usá-la direto em UPDATE com JOIN. O invólucro resolve.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.unaccent_imutavel(texto text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, COALESCE(texto, ''))
$fn$;

-- ---------------------------------------------------------------
-- Quem pode executar
-- ---------------------------------------------------------------
-- Uma fonte só para a lista de gente de casa. É a mesma lista que aparece no
-- responsável do card, no responsável do chamado e no vínculo do colaborador —
-- e é assim que ela não diverge entre as três telas.
CREATE OR REPLACE FUNCTION public.equipe_interna()
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

REVOKE EXECUTE ON FUNCTION public.equipe_interna() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.equipe_interna() TO authenticated;

-- A lista do suporte é a mesma gente. Passa a sair daqui para não existirem
-- duas definições de "time interno" que um dia discordam.
CREATE OR REPLACE FUNCTION public.agentes_de_suporte()
RETURNS TABLE (id uuid, nome text, email text, papel public.app_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT * FROM public.equipe_interna();
$fn$;

-- ---------------------------------------------------------------
-- Recupera o que já foi digitado
-- ---------------------------------------------------------------
-- Casa o nome digitado com um perfil da equipe, ignorando acento e caixa. O que
-- não casar fica como está: chutar vínculo de pagamento seria pior que deixar
-- em branco, porque geraria dívida para a pessoa errada.
UPDATE public.project_tasks t
   SET responsavel_id = e.id
  FROM (
    SELECT p.id,
           lower(unaccent_imutavel(COALESCE(NULLIF(trim(p.full_name), ''), p.email))) AS chave
      FROM public.profiles p
     WHERE EXISTS (SELECT 1 FROM public.user_roles r
                    WHERE r.user_id = p.id AND r.role IN ('admin', 'interno', 'analista'))
  ) e
 WHERE t.responsavel_id IS NULL
   AND t.responsavel_nome IS NOT NULL
   AND lower(unaccent_imutavel(trim(t.responsavel_nome))) = e.chave;

-- ---------------------------------------------------------------
-- Consistência daqui para frente
-- ---------------------------------------------------------------
-- Quando o card aponta para uma pessoa, o nome exibido passa a vir dela. Sem
-- isto, alguém renomeia o perfil e o card continua mostrando o nome antigo.
CREATE OR REPLACE FUNCTION public.task_sincroniza_responsavel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.responsavel_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(trim(p.full_name), ''), p.email)
      INTO NEW.responsavel_nome
      FROM public.profiles p WHERE p.id = NEW.responsavel_id;
  END IF;
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS ao_definir_responsavel ON public.project_tasks;
CREATE TRIGGER ao_definir_responsavel
BEFORE INSERT OR UPDATE OF responsavel_id ON public.project_tasks
FOR EACH ROW EXECUTE FUNCTION public.task_sincroniza_responsavel();

COMMENT ON COLUMN public.project_tasks.responsavel_id IS
  'Quem executa. É por aqui que as horas do card chegam ao financeiro — nome digitado não conta.';
COMMENT ON COLUMN public.project_tasks.responsavel_nome IS
  'Só para exibição, mantido em dia pelo gatilho. A verdade é responsavel_id.';

-- ---------------------------------------------------------------
-- Quem da equipe ainda não tem ficha financeira
-- ---------------------------------------------------------------
-- Pessoa da equipe sem colaborador cadastrado acumula card e não gera título:
-- o trabalho sai e a conta não aparece. Esta view é o que deixa isso visível
-- em vez de descoberto no fim do mês.
CREATE OR REPLACE VIEW public.execucao_sem_ficha
WITH (security_invoker = true) AS
SELECT p.id AS profile_id,
       COALESCE(NULLIF(trim(p.full_name), ''), p.email) AS nome,
       p.email,
       (SELECT r.role FROM public.user_roles r
         WHERE r.user_id = p.id
         ORDER BY CASE r.role WHEN 'admin' THEN 1 WHEN 'interno' THEN 2 ELSE 3 END
         LIMIT 1) AS papel,
       COALESCE(sum(t.horas_estimadas) FILTER (WHERE t.status = 'done'), 0)  AS horas_concluidas,
       COALESCE(sum(t.horas_estimadas) FILTER (WHERE t.status <> 'done'), 0) AS horas_em_execucao
  FROM public.profiles p
  LEFT JOIN public.project_tasks t ON t.responsavel_id = p.id
 WHERE EXISTS (SELECT 1 FROM public.user_roles r
                WHERE r.user_id = p.id AND r.role IN ('admin', 'interno', 'analista'))
   AND NOT EXISTS (SELECT 1 FROM public.colaboradores c WHERE c.profile_id = p.id)
 GROUP BY p.id, p.full_name, p.email;

GRANT SELECT ON public.execucao_sem_ficha TO authenticated;
REVOKE ALL ON public.execucao_sem_ficha FROM anon;
