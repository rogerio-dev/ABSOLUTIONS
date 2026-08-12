import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, FileSignature, Target, TrendingUp, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { useMe } from "@/lib/auth";
import { brl, dt } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel | AB Solutions CRM" },
      { name: "description", content: "Indicadores da carteira, funil e agenda da AB Solutions Consultoria." },
      { property: "og:title", content: "Painel | AB Solutions CRM" },
      { property: "og:description", content: "Indicadores da carteira, funil e agenda." },
    ],
  }),
  component: Painel,
});

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Users; label: string; value: string; hint?: string }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-3 font-display text-3xl font-bold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Painel() {
  const { data: me, isLoading: loadingMe } = useMe();

  const { data } = useQuery({
    queryKey: ["painel"],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const [clientes, carteira, contatos, deals, reunioes, contratos] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("is_carteira", true),
        supabase.from("contacts").select("id", { count: "exact", head: true }),
        supabase.from("deals").select("id, titulo, valor, stage, client_id, clients(nome)"),
        supabase
          .from("meetings")
          .select("id, titulo, inicio, status, clients(nome), solicitada_pelo_cliente")
          .gte("inicio", new Date(Date.now() - 3600_000).toISOString())
          .order("inicio")
          .limit(6),
        supabase.from("contracts").select("valor, status"),
      ]);
      const abertos = (deals.data ?? []).filter((x) => x.stage !== "ganho" && x.stage !== "perdido");
      return {
        clientes: clientes.count ?? 0,
        carteira: carteira.count ?? 0,
        contatos: contatos.count ?? 0,
        pipeline: abertos.reduce((s, x) => s + Number(x.valor ?? 0), 0),
        negocios: abertos.length,
        ganhos: (deals.data ?? []).filter((x) => x.stage === "ganho").length,
        reunioes: reunioes.data ?? [],
        mrr: (contratos.data ?? [])
          .filter((c) => c.status === "ativo")
          .reduce((s, c) => s + Number(c.valor ?? 0), 0),
      };
    },
  });

  const { data: topClientes } = useQuery({
    queryKey: ["painel-top"],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, nome, segmento, uf, tickets_fluig")
        .order("tickets_fluig", { ascending: false, nullsFirst: false })
        .limit(8);
      return data ?? [];
    },
  });

  if (loadingMe) return <AppShell>Carregando…</AppShell>;
  if (!me?.isStaff)
    return (
      <AppShell>
        {me?.clientId ? (
          <div className="panel p-8">
            <h1 className="font-display text-xl font-bold">Bem-vindo ao portal AB Solutions</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Acompanhe seu projeto, contratos e reuniões na área do cliente.
            </p>
            <Link to="/portal" className="mt-4 inline-block text-sm font-semibold text-primary">
              Ir para meu projeto →
            </Link>
          </div>
        ) : (
          <NoAccess />
        )}
      </AppShell>
    );

  return (
    <AppShell>
      <PageHeader
        title="Painel comercial"
        subtitle="Visão geral da base TOTVS Fluig, funil e próximos compromissos."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Building2} label="Empresas na base" value={String(data?.clientes ?? 0)} hint="Clientes e prospects" />
        <Kpi icon={Users} label="Contatos mapeados" value={String(data?.contatos ?? 0)} hint="Decisores e usuários" />
        <Kpi icon={Target} label="Pipeline aberto" value={brl(data?.pipeline)} hint={`${data?.negocios ?? 0} negócios`} />
        <Kpi icon={FileSignature} label="Contratos ativos" value={brl(data?.mrr)} hint="Valor somado" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="panel p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold">Maiores contas por volume de chamados Fluig</h2>
          </div>
          <div className="divide-y divide-border">
            {(topClientes ?? []).map((c) => (
              <Link
                key={c.id}
                to="/clientes/$id"
                params={{ id: c.id }}
                className="flex items-center justify-between gap-4 py-2.5 text-sm hover:text-primary"
              >
                <span className="truncate font-medium">{c.nome}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.segmento ?? "—"} · {c.uf ?? "—"} · {c.tickets_fluig ?? 0} chamados
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold">Próximas reuniões</h2>
          </div>
          {(data?.reunioes ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma reunião agendada.</p>
          ) : (
            <ul className="space-y-3">
              {(data?.reunioes ?? []).map((m) => (
                <li key={m.id} className="rounded-md border border-border p-3">
                  <p className="text-sm font-medium">{m.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {dt(m.inicio)} · {(m.clients as { nome?: string } | null)?.nome ?? "—"}
                  </p>
                  {m.solicitada_pelo_cliente ? (
                    <span className="mt-1 inline-block rounded bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
                      Solicitada pelo cliente
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <Link to="/agenda" className="mt-4 inline-block text-sm font-semibold text-primary">
            Abrir agenda →
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
