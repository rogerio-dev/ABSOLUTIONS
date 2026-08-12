import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMe } from "@/lib/auth";
import { d } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/projetos")({
  head: () => ({
    meta: [
      { title: "Projetos | AB Solutions CRM" },
      { name: "description", content: "Projetos de implantação e sustentação TOTVS Fluig em execução." },
      { property: "og:title", content: "Projetos | AB Solutions CRM" },
      { property: "og:description", content: "Projetos TOTVS Fluig em execução." },
    ],
  }),
  component: Projetos,
});

function Projetos() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(null);

  const { data: projetos } = useQuery({
    queryKey: ["projetos"],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("*, clients(nome)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: sugestoes } = useQuery({
    queryKey: ["proj-clientes", busca],
    enabled: !!me?.isStaff && busca.trim().length > 2,
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, nome").ilike("nome", `%${busca.trim()}%`).limit(8);
      return data ?? [];
    },
  });

  const criar = useMutation({
    mutationFn: async (form: { nome: string; inicio: string; fim: string }) => {
      if (!cliente) throw new Error("Selecione um cliente.");
      const { error } = await supabase.from("projects").insert({
        client_id: cliente.id,
        nome: form.nome,
        data_inicio: form.inicio || null,
        data_fim: form.fim || null,
        status: "em_andamento",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projetos"] });
      setOpen(false);
      setCliente(null);
      setBusca("");
      toast.success("Projeto criado.");
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
      <PageHeader
        title="Projetos"
        subtitle={`${projetos?.length ?? 0} projetos`}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Novo projeto
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo projeto</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  criar.mutate({
                    nome: String(f.get("nome") ?? ""),
                    inicio: String(f.get("inicio") ?? ""),
                    fim: String(f.get("fim") ?? ""),
                  });
                }}
              >
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
                <div className="space-y-1">
                  <Label htmlFor="nome">Nome do projeto</Label>
                  <Input id="nome" name="nome" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="inicio">Início</Label>
                    <Input id="inicio" name="inicio" type="date" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="fim">Previsão de término</Label>
                    <Input id="fim" name="fim" type="date" />
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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(projetos ?? []).map((p) => (
          <Link key={p.id} to="/projetos/$id" params={{ id: p.id }} className="panel p-4 transition-colors hover:border-primary/50">
            <p className="font-medium">{p.nome}</p>
            <p className="text-xs text-muted-foreground">{(p.clients as { nome?: string } | null)?.nome ?? "—"}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {p.status} · {d(p.data_inicio)} — {d(p.data_fim)}
            </p>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
