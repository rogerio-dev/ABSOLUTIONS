
CREATE TYPE public.app_role AS ENUM ('admin','interno','cliente');
CREATE TYPE public.deal_stage AS ENUM ('novo','contatado','reuniao_agendada','proposta','negociacao','ganho','perdido');
CREATE TYPE public.task_status AS ENUM ('backlog','todo','doing','review','done');
CREATE TYPE public.meeting_status AS ENUM ('solicitada','agendada','realizada','cancelada');

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  codigo_t text,
  cnpj text,
  razao_social text,
  tipo text,
  ativo text,
  classificacao text,
  segmento text,
  macro_segmento text,
  cidade text,
  uf text,
  pais text,
  email_contrato text,
  email_financeiro text,
  tickets_fluig integer DEFAULT 0,
  tickets_abertos integer DEFAULT 0,
  ultimo_ticket timestamptz,
  is_carteira boolean NOT NULL DEFAULT false,
  owner_id uuid,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_clients_nome ON public.clients (lower(nome));
CREATE INDEX idx_clients_carteira ON public.clients (is_carteira);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  cargo text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','interno'));
$$;

CREATE OR REPLACE FUNCTION public.my_client_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT client_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text,
  telefone text,
  cargo text,
  papel text,
  is_decisor boolean NOT NULL DEFAULT false,
  tickets integer DEFAULT 0,
  ultima_interacao timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contacts_client ON public.contacts (client_id);

CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  valor numeric(14,2),
  stage public.deal_stage NOT NULL DEFAULT 'novo',
  posicao integer NOT NULL DEFAULT 0,
  probabilidade integer DEFAULT 20,
  previsao_fechamento date,
  owner_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deals_stage ON public.deals (stage);

CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  tipo text NOT NULL DEFAULT 'nota',
  assunto text NOT NULL,
  descricao text,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  visivel_cliente boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activities_client ON public.activities (client_id, ocorrido_em DESC);

CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  pauta text,
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  local text,
  link text,
  status public.meeting_status NOT NULL DEFAULT 'agendada',
  ata text,
  solicitada_pelo_cliente boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_meetings_inicio ON public.meetings (inicio);

CREATE TABLE public.meeting_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  nome text,
  email text NOT NULL,
  notificado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attendees_meeting ON public.meeting_attendees (meeting_id);

CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  numero text,
  titulo text NOT NULL,
  escopo text,
  valor numeric(14,2),
  data_inicio date,
  data_fim date,
  status text NOT NULL DEFAULT 'ativo',
  horas_contratadas numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  nome text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'em_andamento',
  data_inicio date,
  data_fim date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  status public.task_status NOT NULL DEFAULT 'backlog',
  prioridade text NOT NULL DEFAULT 'media',
  responsavel_id uuid,
  responsavel_nome text,
  prazo date,
  horas_estimadas numeric(8,2),
  posicao integer NOT NULL DEFAULT 0,
  visivel_cliente boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_project ON public.project_tasks (project_id, status);

CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  author_nome text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_comments_task ON public.task_comments (task_id);

CREATE OR REPLACE FUNCTION public.client_of_project(_project_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT client_id FROM public.projects WHERE id = _project_id;
$$;
CREATE OR REPLACE FUNCTION public.client_of_task(_task_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.client_id FROM public.project_tasks t JOIN public.projects p ON p.id = t.project_id WHERE t.id = _task_id;
$$;
CREATE OR REPLACE FUNCTION public.task_visivel_cliente(_task_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT visivel_cliente FROM public.project_tasks WHERE id = _task_id;
$$;

-- updated_at triggers
CREATE TRIGGER t1 BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t2 BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t3 BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t4 BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t5 BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t6 BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t7 BEFORE UPDATE ON public.project_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t8 BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients, public.contacts, public.deals, public.activities,
  public.meetings, public.meeting_attendees, public.contracts, public.projects, public.project_tasks,
  public.task_comments, public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.clients, public.contacts, public.deals, public.activities, public.meetings,
  public.meeting_attendees, public.contracts, public.projects, public.project_tasks, public.task_comments,
  public.profiles, public.user_roles TO service_role;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_staff());
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_staff()) WITH CHECK (id = auth.uid() OR public.is_staff());
CREATE POLICY "profiles staff insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "profiles admin delete" ON public.profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- user_roles
CREATE POLICY "roles read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff());

-- clients
CREATE POLICY "clients staff all" ON public.clients FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "clients own read" ON public.clients FOR SELECT TO authenticated USING (id = public.my_client_id());

-- contacts
CREATE POLICY "contacts staff all" ON public.contacts FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "contacts own read" ON public.contacts FOR SELECT TO authenticated USING (client_id = public.my_client_id());

-- deals (internos apenas)
CREATE POLICY "deals staff all" ON public.deals FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- activities
CREATE POLICY "activities staff all" ON public.activities FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "activities own read" ON public.activities FOR SELECT TO authenticated USING (client_id = public.my_client_id() AND visivel_cliente);

-- meetings
CREATE POLICY "meetings staff all" ON public.meetings FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "meetings own read" ON public.meetings FOR SELECT TO authenticated USING (client_id = public.my_client_id());
CREATE POLICY "meetings client request" ON public.meetings FOR INSERT TO authenticated
  WITH CHECK (client_id = public.my_client_id() AND solicitada_pelo_cliente = true AND status = 'solicitada');

-- attendees
CREATE POLICY "attendees staff all" ON public.meeting_attendees FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "attendees own read" ON public.meeting_attendees FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.client_id = public.my_client_id()));

-- contracts
CREATE POLICY "contracts staff all" ON public.contracts FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "contracts own read" ON public.contracts FOR SELECT TO authenticated USING (client_id = public.my_client_id());

-- projects
CREATE POLICY "projects staff all" ON public.projects FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "projects own read" ON public.projects FOR SELECT TO authenticated USING (client_id = public.my_client_id());

-- tasks
CREATE POLICY "tasks staff all" ON public.project_tasks FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "tasks own read" ON public.project_tasks FOR SELECT TO authenticated
  USING (visivel_cliente AND public.client_of_project(project_id) = public.my_client_id());

-- comments
CREATE POLICY "comments staff all" ON public.task_comments FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "comments client read" ON public.task_comments FOR SELECT TO authenticated
  USING (public.client_of_task(task_id) = public.my_client_id() AND public.task_visivel_cliente(task_id));
CREATE POLICY "comments client insert" ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.client_of_task(task_id) = public.my_client_id() AND public.task_visivel_cliente(task_id));
