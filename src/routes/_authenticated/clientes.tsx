import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/auth";
import { d } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes | AB Solutions CRM" },
      { name: "description", content: "Base completa de empresas TOTVS Fluig com filtros por segmento e UF." },
      { property: "og:title", content: "Clientes | AB Solutions CRM" },
      { property: "og:description", content: "Base completa de empresas TOTVS Fluig." },
    ],
  }),
  component: Clientes,
});

const PAGE = 25;

function Clientes() {
  const { data: me, isLoading } = useMe();
  const [q, setQ] = useState("");
  const [uf, setUf] = useState("");
  const [segmento, setSegmento] = useState("");
  const [somenteCarteira, setSomenteCarteira] = useState(false);
  const [page, setPage] = useState(0);


  const { data, isFetching } = useQuery({
    queryKey: ["clientes", q, uf, segmento, somenteCarteira, page],
    enabled: !!me?.isStaff,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from("clients")
        .select("id, nome, cnpj, segmento, uf, cidade, classificacao, tickets_fluig, ultimo_ticket, is_carteira", {
          count: "exact",
        })
        .order("tickets_fluig", { ascending: false, nullsFirst: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);

      if (q.trim()) query = query.or(`nome.ilike.%${q.trim()}%,cnpj.ilike.%${q.trim()}%`);
      if (uf.trim()) query = query.eq("uf", uf.trim().toUpperCase());
      if (segmento.trim()) query = query.ilike("segmento", `%${segmento.trim()}%`);
      if (somenteCarteira) query = query.eq("is_carteira", true);

      const { data, count, error } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  if (isLoading) return <AppShell>Carregando…</AppShell>;
  if (!me?.isStaff)
    return (
      <AppShell>
        <NoAccess />
      </AppShell>
    );

  const total = data?.count ?? 0;
  const pages = Math.ceil(total / PAGE);

  return (
    <AppShell>
      <PageHeader
        title="Clientes e prospects"
        subtitle={`${total.toLocaleString("pt-BR")} empresas encontradas`}
        action={
          <Button asChild>
            <Link to="/clientes/novo">
              <Plus className="mr-2 h-4 w-4" /> Novo cliente
            </Link>
          </Button>
        }
      />

      <div className="panel mb-4 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome ou CNPJ…"
            value={q}
            onChange={(e) => {
              setPage(0);
              setQ(e.target.value);
            }}
          />
        </div>
        <Input
          className="w-24"
          placeholder="UF"
          value={uf}
          onChange={(e) => {
            setPage(0);
            setUf(e.target.value);
          }}
        />
        <Input
          className="w-56"
          placeholder="Segmento"
          value={segmento}
          onChange={(e) => {
            setPage(0);
            setSegmento(e.target.value);
          }}
        />
        <Button
          variant={somenteCarteira ? "default" : "outline"}
          onClick={() => {
            setPage(0);
            setSomenteCarteira((v) => !v);
          }}
        >
          <Star className="mr-2 h-4 w-4" /> Minha carteira
        </Button>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Segmento</th>
              <th className="px-4 py-3">Local</th>
              <th className="px-4 py-3">Classificação</th>
              <th className="px-4 py-3 text-right">Chamados</th>
              <th className="px-4 py-3">Último ticket</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data?.rows ?? []).map((c) => (
              <tr key={c.id} className="hover:bg-surface-2/60">
                <td className="max-w-[320px] px-4 py-3">
                  <Link to="/clientes/$id" params={{ id: c.id }} className="font-medium hover:text-primary">
                    {c.nome}
                  </Link>
                  <p className="text-xs text-muted-foreground">{c.cnpj ?? "—"}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.segmento ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.classificacao ?? "—"}</td>
                <td className="px-4 py-3 text-right">{c.tickets_fluig ?? 0}</td>
                <td className="px-4 py-3 text-muted-foreground">{d(c.ultimo_ticket)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {isFetching ? <p className="p-4 text-xs text-muted-foreground">Atualizando…</p> : null}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Página {page + 1} de {Math.max(pages, 1)}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
