
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.my_client_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.client_of_project(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.client_of_task(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.task_visivel_cliente(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, public, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_client_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_of_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_of_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_visivel_cliente(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_first_admin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin() FROM anon, public, authenticated;
CREATE TRIGGER on_profile_created_bootstrap AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.bootstrap_first_admin();

CREATE POLICY "roles admin manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
