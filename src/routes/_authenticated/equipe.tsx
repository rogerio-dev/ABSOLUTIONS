import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe & Acessos | AB Solutions CRM" },
      { name: "description", content: "Gestão de perfis internos e liberação de acesso ao portal do cliente." },
      { property: "og:title", content: "Equipe & Acessos | AB Solutions CRM" },
      { property: "og:description", content: "Gestão de perfis e acessos." },
    ],
  }),
  component: Equipe,
});

type Role = "admin" | "interno" | "cliente";

function Equipe() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [buscas, setBuscas] = useState<Record<string, string>>({});

  const { data: pessoas } = useQuery({
    queryKey: ["equipe"],
    enabled: !!me?.isAdmin,
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, client_id, clients(nome)").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as Role),
      }));
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipe"] });
      toast.success("Perfil atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const vincular = useMutation({
    mutationFn: async ({ userId, nome }: { userId: string; nome: string }) => {
      const { data: cliente } = await supabase.from("clients").select("id").ilike("nome", `%${nome}%`).limit(1).maybeSingle();
      if (!cliente) throw new Error("Cliente não encontrado.");
      const { error } = await supabase.from("profiles").update({ client_id: cliente.id }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipe"] });
      toast.success("Usuário vinculado ao cliente.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <AppShell>Carregando…</AppShell>;
  if (!me?.isAdmin)
    return (
      <AppShell>
        <NoAccess />
      </AppShell>
    );

  return (
    <AppShell>
      <PageHeader title="Equipe & Acessos" subtitle="Defina perfis internos e libere o portal para clientes." />
      <div className="panel divide-y divide-border">
        {(pessoas ?? []).map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="font-medium">{p.full_name ?? p.email}</p>
              <p className="text-xs text-muted-foreground">
                {p.email} · {(p.clients as { nome?: string } | null)?.nome ?? "sem cliente vinculado"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(["admin", "interno", "cliente"] as Role[]).map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={p.roles.includes(r) ? "default" : "outline"}
                  onClick={() => setRole.mutate({ userId: p.id, role: r })}
                >
                  {r}
                </Button>
              ))}
              <Input
                className="w-52"
                placeholder="Vincular a empresa…"
                value={buscas[p.id] ?? ""}
                onChange={(e) => setBuscas((b) => ({ ...b, [p.id]: e.target.value }))}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => vincular.mutate({ userId: p.id, nome: buscas[p.id] ?? "" })}
              >
                Vincular
              </Button>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
