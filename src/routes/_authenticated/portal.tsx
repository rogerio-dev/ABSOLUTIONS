import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { useMe } from "@/lib/auth";
import { brl, d, dt } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/portal")({
  head: () => ({
    meta: [
      { title: "Portal do cliente | AB Solutions" },
      { name: "description", content: "Acompanhe seu projeto TOTVS Fluig, contratos e reuniões com a AB Solutions." },
      { property: "og:title", content: "Portal do cliente | AB Solutions" },
      { property: "og:description", content: "Acompanhe seu projeto TOTVS Fluig com a AB Solutions." },
    ],
  }),
  component: Portal,
});

function Portal() {
  const { data: me, isLoading } = useMe();

  const { data } = useQuery({
    queryKey: ["portal", me?.clientId],
    enabled: !!me?.clientId,
    queryFn: async () => {
      const [projetos, contratos, reunioes] = await Promise.all([
        supabase.from("projects").select("*").eq("client_id", me!.clientId!).order("created_at", { ascending: false }),
        supabase.from("contracts").select("*").eq("client_id", me!.clientId!),
        supabase.from("meetings").select("*").eq("client_id", me!.clientId!).order("inicio", { ascending: false }).limit(10),
      ]);
      return {
        projetos: projetos.data ?? [],
        contratos: contratos.data ?? [],
        reunioes: reunioes.data ?? [],
      };
    },
  });

  if (isLoading) return <AppShell>Carregando…</AppShell>;
  if (!me?.clientId)
    return (
      <AppShell>
        <NoAccess />
      </AppShell>
    );

  return (
    <AppShell>
      <PageHeader title="Meu projeto" subtitle="Acompanhamento em tempo real da execução com a AB Solutions." />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="font-display text-base font-semibold">Projetos</h2>
          <div className="mt-3 divide-y divide-border">
            {(data?.projetos ?? []).length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">Nenhum projeto em execução.</p>
            ) : (
              (data?.projetos ?? []).map((p) => (
                <Link
                  key={p.id}
                  to="/projetos/$id"
                  params={{ id: p.id }}
                  className="flex items-center justify-between py-3 text-sm hover:text-primary"
                >
                  <span>{p.nome}</span>
                  <span className="text-xs text-muted-foreground">{p.status}</span>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="font-display text-base font-semibold">Contratos</h2>
          <div className="mt-3 divide-y divide-border">
            {(data?.contratos ?? []).length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">Nenhum contrato disponível.</p>
            ) : (
              (data?.contratos ?? []).map((c) => (
                <div key={c.id} className="flex items-center justify-between py-3 text-sm">
                  <span>{c.titulo}</span>
                  <span className="text-xs text-muted-foreground">
                    {brl(Number(c.valor ?? 0))} · até {d(c.data_fim)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel p-5 lg:col-span-2">
          <h2 className="font-display text-base font-semibold">Reuniões</h2>
          <div className="mt-3 divide-y divide-border">
            {(data?.reunioes ?? []).length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">Nenhuma reunião registrada.</p>
            ) : (
              (data?.reunioes ?? []).map((m) => (
                <div key={m.id} className="py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{m.titulo}</span>
                    <span className="text-xs text-muted-foreground">
                      {dt(m.inicio)} · {m.status}
                    </span>
                  </div>
                  {m.ata ? <p className="mt-1 text-sm text-muted-foreground">{m.ata}</p> : null}
                </div>
              ))
            )}
          </div>
          <Link to="/agenda" className="mt-4 inline-block text-sm font-semibold text-primary">
            Solicitar nova reunião →
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
