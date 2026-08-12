import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { useMe } from "@/lib/auth";
import { brl, d } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/contratos")({
  head: () => ({
    meta: [
      { title: "Contratos | AB Solutions CRM" },
      { name: "description", content: "Contratos de consultoria TOTVS Fluig, vigências e valores." },
      { property: "og:title", content: "Contratos | AB Solutions CRM" },
      { property: "og:description", content: "Contratos de consultoria TOTVS Fluig." },
    ],
  }),
  component: Contratos,
});

function Contratos() {
  const { data: me, isLoading } = useMe();
  const { data } = useQuery({
    queryKey: ["contratos"],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("*, clients(id, nome)")
        .order("data_inicio", { ascending: false });
      return data ?? [];
    },
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
      <PageHeader title="Contratos" subtitle={`${data?.length ?? 0} contratos cadastrados`} />
      <div className="panel divide-y divide-border">
        {(data ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhum contrato cadastrado. Feche uma oportunidade no funil para registrar o primeiro.
          </p>
        ) : (
          (data ?? []).map((c) => {
            const cli = c.clients as { id: string; nome: string } | null;
            return (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">
                    {c.numero ? `${c.numero} · ` : ""}
                    {c.titulo}
                  </p>
                  {cli ? (
                    <Link to="/clientes/$id" params={{ id: cli.id }} className="text-xs text-muted-foreground hover:text-primary">
                      {cli.nome}
                    </Link>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {d(c.data_inicio)} — {d(c.data_fim)} · {c.status}
                  </p>
                </div>
                <span className="font-display font-semibold text-primary">{brl(Number(c.valor ?? 0))}</span>
              </div>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
