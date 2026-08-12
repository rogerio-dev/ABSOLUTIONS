import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Mail, Phone, Plus, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMe } from "@/lib/auth";
import { brl, d, dt } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/clientes_/$id")({
  head: () => ({
    meta: [
      { title: "Ficha do cliente | AB Solutions CRM" },
      { name: "description", content: "Visão 360° do cliente: contatos, histórico, negócios, contratos e projetos." },
      { property: "og:title", content: "Ficha do cliente | AB Solutions CRM" },
      { property: "og:description", content: "Visão 360° do cliente TOTVS Fluig." },
    ],
  }),
  component: ClienteDetalhe,
});

function ClienteDetalhe() {
  const { id } = Route.useParams();
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [openAtividade, setOpenAtividade] = useState(false);
  const [openContato, setOpenContato] = useState(false);

  const { data: cliente } = useQuery({
    queryKey: ["cliente", id],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: contatos } = useQuery({
    queryKey: ["cliente-contatos", id],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("*")
        .eq("client_id", id)
        .order("is_decisor", { ascending: false })
        .order("tickets", { ascending: false, nullsFirst: false });
      return data ?? [];
    },
  });

  const { data: extras } = useQuery({
    queryKey: ["cliente-extras", id],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const [atividades, negocios, contratos, projetos, reunioes] = await Promise.all([
        supabase.from("activities").select("*").eq("client_id", id).order("ocorrido_em", { ascending: false }).limit(50),
        supabase.from("deals").select("*").eq("client_id", id).order("created_at", { ascending: false }),
        supabase.from("contracts").select("*").eq("client_id", id).order("data_inicio", { ascending: false }),
        supabase.from("projects").select("*").eq("client_id", id).order("created_at", { ascending: false }),
        supabase.from("meetings").select("*").eq("client_id", id).order("inicio", { ascending: false }).limit(20),
      ]);
      return {
        atividades: atividades.data ?? [],
        negocios: negocios.data ?? [],
        contratos: contratos.data ?? [],
        projetos: projetos.data ?? [],
        reunioes: reunioes.data ?? [],
      };
    },
  });

  const toggleCarteira = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("clients")
        .update({ is_carteira: !cliente?.is_carteira, owner_id: me?.userId ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cliente", id] });
      toast.success("Carteira atualizada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const novaAtividade = useMutation({
    mutationFn: async (form: { tipo: string; assunto: string; descricao: string }) => {
      const { error } = await supabase.from("activities").insert({
        client_id: id,
        tipo: form.tipo,
        assunto: form.assunto,
        descricao: form.descricao,
        created_by: me?.userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cliente-extras", id] });
      setOpenAtividade(false);
      toast.success("Interação registrada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const novoContato = useMutation({
    mutationFn: async (form: { nome: string; email: string; telefone: string; cargo: string }) => {
      const { error } = await supabase.from("contacts").insert({ client_id: id, ...form });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cliente-contatos", id] });
      setOpenContato(false);
      toast.success("Contato adicionado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const novoNegocio = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("deals").insert({
        client_id: id,
        titulo: `Oportunidade Fluig — ${cliente?.nome ?? ""}`.slice(0, 120),
        stage: "novo",
        owner_id: me?.userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cliente-extras", id] });
      toast.success("Oportunidade criada no funil.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <AppShell>Carregando…</AppShell>;
  if (!me?.isStaff)
    return (
      <AppShell>
        <NoAccess />
      </AppShell>
    );

  return (
    <AppShell>
      <Link to="/clientes" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Voltar para clientes
      </Link>

      <PageHeader
        title={cliente?.nome ?? "Cliente"}
        subtitle={[cliente?.cnpj, cliente?.segmento, [cliente?.cidade, cliente?.uf].filter(Boolean).join("/")]
          .filter(Boolean)
          .join(" · ")}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => toggleCarteira.mutate()}>
              <Star className="mr-2 h-4 w-4" />
              {cliente?.is_carteira ? "Na carteira" : "Adicionar à carteira"}
            </Button>
            <Button onClick={() => novoNegocio.mutate()}>
              <Plus className="mr-2 h-4 w-4" /> Nova oportunidade
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Chamados Fluig</p>
          <p className="mt-1 font-display text-2xl font-bold">{cliente?.tickets_fluig ?? 0}</p>
          <p className="text-xs text-muted-foreground">{cliente?.tickets_abertos ?? 0} em aberto</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Último ticket</p>
          <p className="mt-1 font-display text-lg font-bold">{d(cliente?.ultimo_ticket)}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Classificação</p>
          <p className="mt-1 font-display text-lg font-bold">{cliente?.classificacao ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{cliente?.tipo ?? "—"}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">E-mails oficiais</p>
          <p className="mt-1 truncate text-sm">{cliente?.email_contrato ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{cliente?.email_financeiro ?? "—"}</p>
        </div>
      </div>

      <Tabs defaultValue="contatos">
        <TabsList>
          <TabsTrigger value="contatos">Contatos ({contatos?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="negocios">Negócios</TabsTrigger>
          <TabsTrigger value="contratos">Contratos</TabsTrigger>
          <TabsTrigger value="projetos">Projetos</TabsTrigger>
          <TabsTrigger value="reunioes">Reuniões</TabsTrigger>
        </TabsList>

        <TabsContent value="contatos" className="pt-4">
          <div className="mb-3 flex justify-end">
            <Dialog open={openContato} onOpenChange={setOpenContato}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" /> Novo contato
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Novo contato</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    novoContato.mutate({
                      nome: String(f.get("nome") ?? ""),
                      email: String(f.get("email") ?? ""),
                      telefone: String(f.get("telefone") ?? ""),
                      cargo: String(f.get("cargo") ?? ""),
                    });
                  }}
                >
                  <div className="space-y-1">
                    <Label htmlFor="nome">Nome</Label>
                    <Input id="nome" name="nome" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" name="email" type="email" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="telefone">Telefone</Label>
                      <Input id="telefone" name="telefone" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cargo">Cargo</Label>
                      <Input id="cargo" name="cargo" />
                    </div>
                  </div>
                  <Button type="submit" className="w-full">
                    Salvar
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(contatos ?? []).map((c) => (
              <div key={c.id} className="panel p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.cargo ?? "—"}</p>
                  </div>
                  {c.is_decisor ? (
                    <span className="shrink-0 rounded bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      Decisor
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {c.email ? (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-2 hover:text-primary">
                      <Mail className="h-3.5 w-3.5" /> <span className="truncate">{c.email}</span>
                    </a>
                  ) : null}
                  {c.telefone ? (
                    <span className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5" /> {c.telefone}
                    </span>
                  ) : null}
                  <p>
                    {c.tickets ?? 0} chamados · última interação {d(c.ultima_interacao)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="historico" className="pt-4">
          <div className="mb-3 flex justify-end">
            <Dialog open={openAtividade} onOpenChange={setOpenAtividade}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" /> Registrar interação
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar interação</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    novaAtividade.mutate({
                      tipo: String(f.get("tipo") ?? "nota"),
                      assunto: String(f.get("assunto") ?? ""),
                      descricao: String(f.get("descricao") ?? ""),
                    });
                  }}
                >
                  <div className="space-y-1">
                    <Label htmlFor="tipo">Tipo</Label>
                    <select
                      id="tipo"
                      name="tipo"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="ligacao">Ligação</option>
                      <option value="email">E-mail</option>
                      <option value="reuniao">Reunião</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="nota">Nota</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="assunto">Assunto</Label>
                    <Input id="assunto" name="assunto" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="descricao">Detalhes</Label>
                    <Textarea id="descricao" name="descricao" rows={4} />
                  </div>
                  <Button type="submit" className="w-full">
                    Salvar
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="panel divide-y divide-border">
            {(extras?.atividades ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhuma interação registrada ainda.</p>
            ) : (
              (extras?.atividades ?? []).map((a) => (
                <div key={a.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{a.assunto}</p>
                    <span className="text-xs text-muted-foreground">{dt(a.ocorrido_em)}</span>
                  </div>
                  <p className="text-xs uppercase tracking-wider text-primary">{a.tipo}</p>
                  {a.descricao ? <p className="mt-2 text-sm text-muted-foreground">{a.descricao}</p> : null}
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="negocios" className="pt-4">
          <div className="panel divide-y divide-border">
            {(extras?.negocios ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhum negócio aberto.</p>
            ) : (
              (extras?.negocios ?? []).map((n) => (
                <div key={n.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{n.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      Etapa: {n.stage} · previsão {d(n.previsao_fechamento)}
                    </p>
                  </div>
                  <span className="font-display font-semibold text-primary">{brl(Number(n.valor ?? 0))}</span>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="contratos" className="pt-4">
          <div className="panel divide-y divide-border">
            {(extras?.contratos ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhum contrato cadastrado.</p>
            ) : (
              (extras?.contratos ?? []).map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">
                      {c.numero ? `${c.numero} · ` : ""}
                      {c.titulo}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d(c.data_inicio)} — {d(c.data_fim)} · {c.status}
                    </p>
                  </div>
                  <span className="font-display font-semibold">{brl(Number(c.valor ?? 0))}</span>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="projetos" className="pt-4">
          <div className="panel divide-y divide-border">
            {(extras?.projetos ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhum projeto em execução.</p>
            ) : (
              (extras?.projetos ?? []).map((p) => (
                <Link
                  key={p.id}
                  to="/projetos/$id"
                  params={{ id: p.id }}
                  className="flex items-center justify-between gap-3 p-4 hover:text-primary"
                >
                  <div>
                    <p className="font-medium">{p.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.status} · {d(p.data_inicio)} — {d(p.data_fim)}
                    </p>
                  </div>
                  <span className="text-sm">Abrir →</span>
                </Link>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="reunioes" className="pt-4">
          <div className="panel divide-y divide-border">
            {(extras?.reunioes ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhuma reunião registrada.</p>
            ) : (
              (extras?.reunioes ?? []).map((m) => (
                <div key={m.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{m.titulo}</p>
                    <span className="text-xs text-muted-foreground">{dt(m.inicio)}</span>
                  </div>
                  {m.ata ? <p className="mt-2 text-sm text-muted-foreground">{m.ata}</p> : null}
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
