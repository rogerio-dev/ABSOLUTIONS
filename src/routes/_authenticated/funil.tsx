import { createFileRoute, Link } from "@tanstack/react-router";
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
import { STAGES, brl, d } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/funil")({
  head: () => ({
    meta: [
      { title: "Funil comercial | AB Solutions CRM" },
      { name: "description", content: "Kanban de oportunidades TOTVS Fluig, do lead ao contrato assinado." },
      { property: "og:title", content: "Funil comercial | AB Solutions CRM" },
      { property: "og:description", content: "Kanban de oportunidades TOTVS Fluig." },
    ],
  }),
  component: Funil,
});

type Deal = {
  id: string;
  titulo: string;
  valor: number | null;
  stage: string;
  previsao_fechamento: string | null;
  client_id: string | null;
  clients: { nome: string } | null;
};

function Funil() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [clienteSel, setClienteSel] = useState<{ id: string; nome: string } | null>(null);

  const { data: deals } = useQuery({
    queryKey: ["deals"],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("id, titulo, valor, stage, previsao_fechamento, client_id, clients(nome)")
        .order("posicao");
      if (error) throw error;
      return (data ?? []) as unknown as Deal[];
    },
  });

  const { data: sugestoes } = useQuery({
    queryKey: ["busca-cliente", busca],
    enabled: !!me?.isStaff && busca.trim().length > 2,
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, nome").ilike("nome", `%${busca.trim()}%`).limit(8);
      return data ?? [];
    },
  });

  const mover = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase
        .from("deals")
        .update({ stage: stage as "novo" | "contatado" | "reuniao_agendada" | "proposta" | "negociacao" | "ganho" | "perdido" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const criar = useMutation({
    mutationFn: async (form: { titulo: string; valor: string; previsao: string }) => {
      if (!clienteSel) throw new Error("Selecione um cliente.");
      const { error } = await supabase.from("deals").insert({
        client_id: clienteSel.id,
        titulo: form.titulo,
        valor: form.valor ? Number(form.valor) : null,
        previsao_fechamento: form.previsao || null,
        stage: "novo",
        owner_id: me?.userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      setOpen(false);
      setClienteSel(null);
      setBusca("");
      toast.success("Oportunidade criada.");
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

  const abertos = (deals ?? []).filter((x) => x.stage !== "ganho" && x.stage !== "perdido");

  return (
    <AppShell>
      <PageHeader
        title="Funil comercial"
        subtitle={`${abertos.length} oportunidades abertas · ${brl(
          abertos.reduce((s, x) => s + Number(x.valor ?? 0), 0),
        )} em pipeline`}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Nova oportunidade
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova oportunidade</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  criar.mutate({
                    titulo: String(f.get("titulo") ?? ""),
                    valor: String(f.get("valor") ?? ""),
                    previsao: String(f.get("previsao") ?? ""),
                  });
                }}
              >
                <div className="space-y-1">
                  <Label htmlFor="cliente">Cliente</Label>
                  <Input
                    id="cliente"
                    placeholder="Digite o nome da empresa…"
                    value={clienteSel?.nome ?? busca}
                    onChange={(e) => {
                      setClienteSel(null);
                      setBusca(e.target.value);
                    }}
                  />
                  {!clienteSel && (sugestoes ?? []).length > 0 ? (
                    <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                      {(sugestoes ?? []).map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                          onClick={() => setClienteSel(c)}
                        >
                          {c.nome}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="titulo">Título</Label>
                  <Input id="titulo" name="titulo" required placeholder="Projeto de workflow Fluig" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="valor">Valor (R$)</Label>
                    <Input id="valor" name="valor" type="number" step="100" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="previsao">Previsão</Label>
                    <Input id="previsao" name="previsao" type="date" />
                  </div>
                </div>
                <Button type="submit" className="w-full">
                  Criar
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Kanban
        columns={STAGES}
        items={deals ?? []}
        columnOf={(deal) => deal.stage}
        onMove={(deal, stage) => mover.mutate({ id: deal.id, stage })}
        renderCard={(deal) => (
          <div>
            <p className="text-sm font-medium">{deal.titulo}</p>
            {deal.client_id ? (
              <Link
                to="/clientes/$id"
                params={{ id: deal.client_id }}
                className="mt-1 block truncate text-xs text-muted-foreground hover:text-primary"
              >
                {deal.clients?.nome ?? "Cliente"}
              </Link>
            ) : null}
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-primary">{brl(Number(deal.valor ?? 0))}</span>
              <span className="text-muted-foreground">{d(deal.previsao_fechamento)}</span>
            </div>
          </div>
        )}
      />
    </AppShell>
  );
}
