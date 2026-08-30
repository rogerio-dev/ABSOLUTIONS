import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
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
        supabase.from("contracts").select("valor_mensal, situacao"),
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
        // Receita recorrente sai do valor mensal. O valor global de um contrato
        // por projeto nao recorre, e somava um numero que nunca foi verdade.
        mrr: (contratos.data ?? [])
          .filter((c) => c.situacao === "ativo")
          .reduce((s, c) => s + Number(c.valor_mensal ?? 0), 0),
      };
    },
  });

  /*
   * O que exige decisão hoje. O painel antigo mostrava só o funil, e metade do
   * sistema — suporte, financeiro, prospecção, aceite de entrega — não aparecia
   * em lugar nenhum. Sinal que não chega à primeira tela é sinal que não existe.
   */
  const { data: pendencias } = useQuery({
    queryKey: ["painel-pendencias"],
    enabled: !!me?.isStaff,
    refetchInterval: 120_000,
    queryFn: async () => {
      const hoje = new Date().toISOString().slice(0, 10);
      const agora = new Date().toISOString();
      const [semDono, foraDoPrazo, entregas, alvos, receber, pagar] = await Promise.all([
        supabase.from("tickets").select("id", { count: "exact", head: true })
          .is("responsavel_id", null).not("status", "in", "(resolvido,fechado)"),
        supabase.from("tickets").select("id", { count: "exact", head: true })
          .not("status", "in", "(resolvido,fechado)").is("pausado_desde", null)
          .lt("prazo_resolucao", agora),
        supabase.from("entregas").select("id", { count: "exact", head: true })
          .eq("situacao", "aguardando"),
        supabase.from("prospect_alvos").select("id", { count: "exact", head: true })
          .in("situacao", ["a_contatar", "tentando", "respondeu", "reuniao_marcada"])
          .lte("proxima_acao_em", hoje),
        supabase.from("recebimentos").select("id", { count: "exact", head: true })
          .in("situacao", ["previsto", "emitido"]).lt("vencimento", hoje),
        supabase.from("pagamentos").select("id", { count: "exact", head: true })
          .in("situacao", ["previsto", "emitido"]).lt("vencimento", hoje),
      ]);
      return {
        semDono: semDono.count ?? 0,
        foraDoPrazo: foraDoPrazo.count ?? 0,
        entregas: entregas.count ?? 0,
        alvos: alvos.count ?? 0,
        receber: receber.count ?? 0,
        pagar: pagar.count ?? 0,
      };
    },
  });

  const { data: rentabilidade } = useQuery({
    queryKey: ["painel-rentabilidade"],
    enabled: !!me?.isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("rentabilidade_cliente")
        .select("*")
        .order("faturado", { ascending: false })
        .limit(8);
      return data ?? [];
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
  // O analista não tem painel de CRM; o suporte é a casa dele. Redirecionar
  // aqui cobre todos os caminhos que levam a /painel depois do login.
  if (me?.isAnalista) return <Navigate to="/tickets" replace />;
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
        title="Painel"
        subtitle="O que exige decisão hoje, e como o negócio está."
      />

      {/* Só aparece o que realmente pede ação. Painel que mostra zero em tudo
          ensina a pessoa a ignorar o painel. */}
      {pendencias &&
        Object.values(pendencias).some((n) => n > 0) && (
          <section className="panel mb-4 border-primary/30 bg-primary/5 p-4">
            <p className="mb-3 text-sm font-medium text-primary">Precisa de você</p>
            <div className="flex flex-wrap gap-2">
              {[
                { n: pendencias.semDono, texto: "chamado(s) sem responsável", para: "/tickets" as const },
                { n: pendencias.foraDoPrazo, texto: "chamado(s) fora do prazo", para: "/tickets" as const, grave: true },
                { n: pendencias.entregas, texto: "entrega(s) esperando aceite do cliente", para: "/projetos" as const },
                { n: pendencias.alvos, texto: "alvo(s) de prospecção com toque atrasado", para: "/prospeccao" as const },
                { n: pendencias.receber, texto: "título(s) a receber vencido(s)", para: "/financeiro" as const, grave: true },
                { n: pendencias.pagar, texto: "conta(s) a pagar vencida(s)", para: "/financeiro" as const, grave: true },
              ]
                .filter((x) => x.n > 0)
                .map((x) => (
                  <Link
                    key={x.texto}
                    to={x.para}
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors hover:border-primary/60 ${
                      x.grave ? "border-rose-500/40" : "border-border"
                    }`}
                  >
                    <strong className={x.grave ? "text-rose-300" : "text-foreground"}>{x.n}</strong>
                    <span className="text-muted-foreground">{x.texto}</span>
                  </Link>
                ))}
            </div>
          </section>
        )}

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

      {/* A pergunta que decide preço: este cliente paga o que custa atendê-lo?
          Receita é o já faturado; custo são as horas orçadas nos cards
          concluídos — o mesmo número que vira dívida com quem executa. */}
      {me?.isAdmin && (rentabilidade ?? []).length > 0 && (
        <section className="panel mt-4 p-5">
          <h2 className="font-display text-base font-semibold">Rentabilidade por cliente</h2>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            O custo considera só as horas já concluídas. Projeto em andamento ainda vai consumir mais.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Cliente</th>
                  <th className="px-2 py-2 text-right font-medium">Faturado</th>
                  <th className="px-2 py-2 text-right font-medium">Recebido</th>
                  <th className="px-2 py-2 text-right font-medium">Custo</th>
                  <th className="px-2 py-2 text-right font-medium">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(rentabilidade ?? []).map((r) => {
                  const margem = Number(r.faturado ?? 0) - Number(r.custo_execucao ?? 0);
                  const pct = Number(r.faturado ?? 0) > 0
                    ? Math.round((margem / Number(r.faturado)) * 100)
                    : null;
                  return (
                    <tr key={r.id as string}>
                      <td className="px-2 py-2">
                        <Link to="/clientes/$id" params={{ id: r.id as string }} className="hover:text-primary">
                          {r.nome as string}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{brl(Number(r.faturado))}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                        {brl(Number(r.recebido))}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                        {brl(Number(r.custo_execucao))}
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums font-medium ${
                        margem >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}>
                        {brl(margem)}
                        {pct !== null && <span className="ml-1 text-[11px] opacity-70">{pct}%</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AppShell>
  );
}
