import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMe } from "@/lib/auth";
import { dt, downloadIcs } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda | AB Solutions CRM" },
      { name: "description", content: "Reuniões, convites e atas dos projetos TOTVS Fluig da AB Solutions." },
      { property: "og:title", content: "Agenda | AB Solutions CRM" },
      { property: "og:description", content: "Reuniões, convites e atas dos projetos Fluig." },
    ],
  }),
  component: Agenda,
});

function Agenda() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(null);

  const { data: reunioes } = useQuery({
    queryKey: ["reunioes"],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("*, clients(nome)")
        .order("inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sugestoes } = useQuery({
    queryKey: ["agenda-clientes", busca],
    enabled: !!me?.isStaff && busca.trim().length > 2,
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, nome").ilike("nome", `%${busca.trim()}%`).limit(8);
      return data ?? [];
    },
  });

  const criar = useMutation({
    mutationFn: async (form: { titulo: string; inicio: string; fim: string; local: string; pauta: string }) => {
      const clientId = me?.isStaff ? cliente?.id : me?.clientId;
      if (!clientId) throw new Error("Selecione um cliente.");
      const { error } = await supabase.from("meetings").insert({
        client_id: clientId as string,
        titulo: form.titulo,
        inicio: new Date(form.inicio).toISOString(),
        fim: form.fim
          ? new Date(form.fim).toISOString()
          : new Date(new Date(form.inicio).getTime() + 3600_000).toISOString(),
        local: form.local || null,
        pauta: form.pauta || null,
        status: me?.isStaff ? "agendada" : "solicitada",
        solicitada_pelo_cliente: !me?.isStaff,
        created_by: me?.userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reunioes"] });
      setOpen(false);
      setCliente(null);
      setBusca("");
      toast.success(me?.isStaff ? "Reunião agendada." : "Solicitação enviada à equipe AB Solutions.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meetings").update({ status: "agendada" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reunioes"] }),
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
        title="Agenda"
        subtitle={me?.isStaff ? "Reuniões da equipe com clientes e prospects." : "Suas reuniões com a AB Solutions."}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <CalendarPlus className="mr-2 h-4 w-4" />
                {me?.isStaff ? "Agendar reunião" : "Solicitar reunião"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{me?.isStaff ? "Agendar reunião" : "Solicitar reunião"}</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  criar.mutate({
                    titulo: String(f.get("titulo") ?? ""),
                    inicio: String(f.get("inicio") ?? ""),
                    fim: String(f.get("fim") ?? ""),
                    local: String(f.get("local") ?? ""),
                    pauta: String(f.get("pauta") ?? ""),
                  });
                }}
              >
                {me?.isStaff ? (
                  <div className="space-y-1">
                    <Label htmlFor="cliente">Cliente</Label>
                    <Input
                      id="cliente"
                      value={cliente?.nome ?? busca}
                      onChange={(e) => {
                        setCliente(null);
                        setBusca(e.target.value);
                      }}
                      placeholder="Buscar empresa…"
                    />
                    {!cliente && (sugestoes ?? []).length > 0 ? (
                      <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                        {(sugestoes ?? []).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                            onClick={() => setCliente(c)}
                          >
                            {c.nome}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label htmlFor="titulo">Assunto</Label>
                  <Input id="titulo" name="titulo" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="inicio">Início</Label>
                    <Input id="inicio" name="inicio" type="datetime-local" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="fim">Fim</Label>
                    <Input id="fim" name="fim" type="datetime-local" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="local">Local / link</Label>
                  <Input id="local" name="local" placeholder="Teams, Meet, presencial…" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pauta">Pauta</Label>
                  <Textarea id="pauta" name="pauta" rows={3} />
                </div>
                <Button type="submit" className="w-full">
                  Confirmar
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="panel divide-y divide-border">
        {(reunioes ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhuma reunião registrada.</p>
        ) : (
          (reunioes ?? []).map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-medium">{m.titulo}</p>
                <p className="text-xs text-muted-foreground">
                  {dt(m.inicio)} · {(m.clients as { nome?: string } | null)?.nome ?? "—"} · {m.status}
                  {m.local ? ` · ${m.local}` : ""}
                </p>
                {m.pauta ? <p className="mt-1 text-sm text-muted-foreground">{m.pauta}</p> : null}
              </div>
              <div className="flex gap-2">
                {me?.isStaff && m.status === "solicitada" ? (
                  <Button size="sm" onClick={() => confirmar.mutate(m.id)}>
                    Confirmar
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadIcs({
                      titulo: m.titulo,
                      descricao: m.pauta,
                      inicio: m.inicio,
                      fim: m.fim,
                      local: m.local,
                    })
                  }
                >
                  <Download className="mr-2 h-4 w-4" /> Convite .ics
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}
