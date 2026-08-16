import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, EyeOff, MessageSquare, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { Kanban } from "@/components/Kanban";
import { TaskPanel } from "@/components/TaskPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMe } from "@/lib/auth";
import { TASK_STATUS, d } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/projetos_/$id")({
  head: () => ({
    meta: [
      { title: "Projeto | AB Solutions CRM" },
      { name: "description", content: "Kanban de tarefas do projeto TOTVS Fluig com visibilidade para o cliente." },
      { property: "og:title", content: "Projeto | AB Solutions CRM" },
      { property: "og:description", content: "Kanban de tarefas do projeto TOTVS Fluig." },
    ],
  }),
  component: ProjetoDetalhe,
});

type Task = {
  id: string;
  titulo: string;
  descricao: string | null;
  status: "backlog" | "todo" | "doing" | "review" | "done";
  prioridade: string | null;
  responsavel_nome: string | null;
  prazo: string | null;
  visivel_cliente: boolean;
};

const CORES_PRIORIDADE: Record<string, string> = {
  alta: "bg-rose-500/15 text-rose-300",
  media: "bg-amber-500/15 text-amber-300",
  baixa: "bg-slate-500/15 text-slate-300",
};

function ProjetoDetalhe() {
  const { id } = Route.useParams();
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [aberta, setAberta] = useState<Task | null>(null);

  const { data: projeto } = useQuery({
    queryKey: ["projeto", id],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("*, clients(nome)").eq("id", id).maybeSingle();
      return data;
    },
  });

  const { data: tasks } = useQuery({
    queryKey: ["tasks", id],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_tasks")
        .select("id, titulo, descricao, status, prioridade, responsavel_nome, prazo, visivel_cliente")
        .eq("project_id", id)
        .order("posicao");
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  // Contagem de comentários por tarefa, para o cartão indicar que há conversa.
  const { data: comentariosPorTarefa } = useQuery({
    queryKey: ["contagem-comentarios", id, tasks?.length],
    enabled: !!tasks?.length,
    queryFn: async () => {
      const { data } = await supabase
        .from("task_comments")
        .select("task_id")
        .in("task_id", tasks!.map((t) => t.id));
      const mapa: Record<string, number> = {};
      for (const linha of data ?? []) mapa[linha.task_id as string] = (mapa[linha.task_id as string] ?? 0) + 1;
      return mapa;
    },
  });

  const mover = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: Task["status"] }) => {
      const { error } = await supabase.from("project_tasks").update({ status }).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const criar = useMutation({
    mutationFn: async (form: { titulo: string; responsavel: string; prazo: string; visivel: boolean }) => {
      const { error } = await supabase.from("project_tasks").insert({
        project_id: id,
        titulo: form.titulo,
        responsavel_nome: form.responsavel || null,
        prazo: form.prazo || null,
        visivel_cliente: form.visivel,
        status: "backlog",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", id] });
      setOpen(false);
      toast.success("Tarefa criada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <AppShell>Carregando…</AppShell>;
  if (!me?.isStaff && !me?.clientId)
    return (
      <AppShell>
        <NoAccess />
      </AppShell>
    );

  return (
    <AppShell>
      <PageHeader
        title={projeto?.nome ?? "Projeto"}
        subtitle={`${(projeto?.clients as { nome?: string } | null)?.nome ?? ""} · ${projeto?.status ?? ""} · entrega ${d(
          projeto?.data_fim,
        )}`}
        action={
          me?.isStaff ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Nova tarefa
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova tarefa</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    criar.mutate({
                      titulo: String(f.get("titulo") ?? ""),
                      responsavel: String(f.get("responsavel") ?? ""),
                      prazo: String(f.get("prazo") ?? ""),
                      visivel: f.get("visivel") === "on",
                    });
                  }}
                >
                  <div className="space-y-1">
                    <Label htmlFor="titulo">Título</Label>
                    <Input id="titulo" name="titulo" required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="responsavel">Responsável</Label>
                      <Input id="responsavel" name="responsavel" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="prazo">Prazo</Label>
                      <Input id="prazo" name="prazo" type="date" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="visivel" defaultChecked /> Visível para o cliente
                  </label>
                  <Button type="submit" className="w-full">
                    Criar
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          ) : null
        }
      />

      <Kanban
        columns={TASK_STATUS}
        items={tasks ?? []}
        columnOf={(t) => t.status}
        podeArrastar={!!me?.isStaff}
        onCardClick={(t) => setAberta(t)}
        onMove={(t, status) =>
          me?.isStaff ? mover.mutate({ taskId: t.id, status: status as Task["status"] }) : undefined
        }
        renderCard={(t) => {
          const comentarios = comentariosPorTarefa?.[t.id] ?? 0;
          const atrasada = t.prazo && t.status !== "done" && new Date(t.prazo) < new Date();
          return (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium leading-snug">{t.titulo}</p>

              <div className="flex flex-wrap items-center gap-1.5">
                {t.prioridade && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                      CORES_PRIORIDADE[t.prioridade] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {t.prioridade}
                  </span>
                )}
                {!t.visivel_cliente && me?.isStaff && (
                  <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    <EyeOff className="h-3 w-3" /> interno
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {t.responsavel_nome && (
                  <span className="flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                      {t.responsavel_nome.trim().charAt(0).toUpperCase()}
                    </span>
                    {t.responsavel_nome}
                  </span>
                )}
                {t.prazo && (
                  <span className={`flex items-center gap-1 ${atrasada ? "text-rose-400" : ""}`}>
                    <CalendarDays className="h-3 w-3" />
                    {d(t.prazo)}
                  </span>
                )}
                {comentarios > 0 && (
                  <span className="ml-auto flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {comentarios}
                  </span>
                )}
              </div>
            </div>
          );
        }}
      />

      <TaskPanel
        tarefa={aberta}
        clientId={(projeto?.client_id as string | undefined) ?? null}
        aberto={!!aberta}
        onFechar={() => setAberta(null)}
      />
    </AppShell>
  );
}
