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
  responsavel_id: string | null;
  horas_estimadas: number | null;
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

  /*
   * A lista de quem pode executar sai do banco, não de campo digitado. É por
   * `responsavel_id` que as horas do card chegam ao financeiro — nome escrito à
   * mão não liga a ninguém, e o custo some sem ninguém perceber.
   */
  const { data: saude } = useQuery({
    queryKey: ["projeto-horas", id],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const { data } = await supabase.from("projeto_horas").select("*").eq("id", id).maybeSingle();
      return data;
    },
  });

  const salvarOrcamento = useMutation({
    mutationFn: async (campos: { horas_orcadas: number | null; valor_hora_dev: number | null }) => {
      const { error } = await supabase.from("projects").update(campos).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projeto-horas", id] });
      qc.invalidateQueries({ queryKey: ["projeto", id] });
      toast.success("Orçamento do projeto atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: equipe } = useQuery({
    queryKey: ["equipe-interna"],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("equipe_interna");
      if (error) throw error;
      return data ?? [];
    },
  });

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
        .select("id, titulo, descricao, status, prioridade, responsavel_nome, responsavel_id, horas_estimadas, prazo, visivel_cliente")
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
    // `responsavel` aqui é o id do perfil; o nome exibido é preenchido pelo
    // gatilho no banco, para não envelhecer quando alguém renomear o perfil.
    mutationFn: async (form: {
      titulo: string; responsavel: string; prazo: string; horas: string; visivel: boolean;
    }) => {
      const { error } = await supabase.from("project_tasks").insert({
        project_id: id,
        titulo: form.titulo,
        responsavel_id: form.responsavel || null,
        prazo: form.prazo || null,
        horas_estimadas: form.horas ? Number(form.horas.replace(",", ".")) : null,
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
                      horas: String(f.get("horas") ?? ""),
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
                      <select
                        id="responsavel"
                        name="responsavel"
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      >
                        <option value="">Sem responsável</option>
                        {(equipe ?? []).map((p) => (
                          <option key={p.id as string} value={p.id as string}>
                            {p.nome as string} ({p.papel as string})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="prazo">Prazo</Label>
                      <Input id="prazo" name="prazo" type="date" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="horas">Horas orçadas</Label>
                    <Input id="horas" name="horas" type="number" step="0.5" min="0" placeholder="8" />
                    <p className="text-[11px] text-muted-foreground">
                      É o que se paga a quem executar, quando o card for concluído. Definido aqui, antes
                      de começar — não apontado depois.
                    </p>
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

      {me?.isStaff && saude && (
        <section className="panel mb-4 p-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Orçamento do projeto</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                As horas vendidas são o teto. A soma dos cards não deveria passar disso — é o que o
                cliente contratou.
              </p>
            </div>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const num = (k: string) => {
                  const v = String(f.get(k) ?? "").trim();
                  return v ? Number(v.replace(",", ".")) : null;
                };
                salvarOrcamento.mutate({
                  horas_orcadas: num("horas_orcadas"),
                  valor_hora_dev: num("valor_hora_dev"),
                });
              }}
            >
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">Horas vendidas</label>
                <Input
                  name="horas_orcadas"
                  type="number"
                  step="0.5"
                  className="h-9 w-28"
                  defaultValue={(saude.horas_orcadas as number | null) ?? ""}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">
                  Custo da hora
                </label>
                <Input
                  name="valor_hora_dev"
                  type="number"
                  step="0.01"
                  className="h-9 w-28"
                  defaultValue={(saude.valor_hora_dev as number | null) ?? ""}
                />
              </div>
              <Button type="submit" size="sm" disabled={salvarOrcamento.isPending}>
                Salvar
              </Button>
            </form>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-5">
            {[
              ["Vendidas", saude.horas_orcadas],
              ["Nos cards", saude.horas_nos_cards],
              ["Em execução", saude.horas_pendentes],
              ["A pagar", saude.horas_a_pagar],
              ["Saldo", saude.horas_livres],
            ].map(([r, v], i) => {
              const n = Number(v ?? 0);
              return (
                <div key={r as string}>
                  <p className="text-[11px] text-muted-foreground">{r as string}</p>
                  <p
                    className={`font-display text-lg font-semibold ${
                      i === 4 ? (n < 0 ? "text-rose-400" : "text-emerald-400") : "text-foreground"
                    }`}
                  >
                    {n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h
                  </p>
                </div>
              );
            })}
          </div>

          {Number(saude.horas_livres ?? 0) < 0 && (
            <p className="mt-3 text-xs text-amber-300">
              Os cards somam mais horas do que foi vendido. Ou o orçamento está desatualizado, ou o
              projeto vai custar mais do que rendeu.
            </p>
          )}
        </section>
      )}

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
          const horasDoCard = Number((t as { horas_estimadas?: number | null }).horas_estimadas ?? 0);
          const atrasada = t.prazo && t.status !== "done" && new Date(t.prazo) < new Date();
          return (
            <div className="flex flex-col gap-2">
              {horasDoCard > 0 && (
                <span
                  title="Horas orçadas para este card. É o que se paga a quem executa quando ele é concluído."
                  className="inline-flex w-fit items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {horasDoCard.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h
                </span>
              )}
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
                {t.responsavel_nome && !t.responsavel_id && (
                  <span
                    title="Nome digitado sem vínculo. As horas deste card não chegam ao financeiro — abra o card e escolha a pessoa na lista."
                    className="inline-flex w-fit items-center gap-1 rounded border border-amber-500/40 px-1.5 py-0.5 text-[10px] text-amber-300"
                  >
                    responsável não vinculado
                  </span>
                )}
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
