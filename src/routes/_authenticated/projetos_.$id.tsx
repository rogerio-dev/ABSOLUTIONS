import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { Kanban } from "@/components/Kanban";
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
  status: "backlog" | "todo" | "doing" | "review" | "done";
  prioridade: string | null;
  responsavel_nome: string | null;
  prazo: string | null;
  visivel_cliente: boolean;
};

function ProjetoDetalhe() {
  const { id } = Route.useParams();
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

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
        .select("id, titulo, status, prioridade, responsavel_nome, prazo, visivel_cliente")
        .eq("project_id", id)
        .order("posicao");
      if (error) throw error;
      return (data ?? []) as Task[];
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
        onMove={(t, status) =>
          me?.isStaff ? mover.mutate({ taskId: t.id, status: status as Task["status"] }) : undefined
        }
        renderCard={(t) => (
          <div>
            <p className="text-sm font-medium">{t.titulo}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.responsavel_nome ?? "Sem responsável"} · {d(t.prazo)}
            </p>
            {!t.visivel_cliente && me?.isStaff ? (
              <span className="mt-2 inline-block rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                Interno
              </span>
            ) : null}
          </div>
        )}
      />
    </AppShell>
  );
}
