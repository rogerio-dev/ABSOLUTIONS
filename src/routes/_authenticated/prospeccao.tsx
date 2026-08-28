import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Crosshair, Layers, Phone, Search, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMe } from "@/lib/auth";
import { d } from "@/lib/crm";
import { EM_ANDAMENTO, FATORES, componentes, faixaDoScore, porQue } from "@/lib/prospeccao";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/prospeccao")({
  head: () => ({
    meta: [
      { title: "Prospecção | AB Solutions CRM" },
      {
        name: "description",
        content: "Base de prospecção ranqueada por probabilidade de virar contrato.",
      },
    ],
  }),
  component: Prospeccao,
});

type Alvo = {
  id: string;
  nome: string;
  classificacao: string | null;
  macro_segmento: string | null;
  tickets_fluig: number | null;
  tickets_abertos: number | null;
  ultimo_ticket: string | null;
  telefones: number | null;
  emails: number | null;
  decisores: number | null;
  score: number;
  disponivel: boolean;
  p_uso: number;
  p_recencia: number;
  p_dor: number;
  p_porte: number;
  p_alcance: number;
};

const CLASSIFICACOES = ["Large", "Select", "VIP", "Padrão", "Setor Público"];
const SEGMENTOS = ["SupplyChain", "Services", "Consumer", "Healthcare", "Financial Services"];

/** Barra empilhada mostrando de onde veio o score. */
function Composicao({ linha }: { linha: Alvo }) {
  return (
    <div className="flex h-1.5 w-28 overflow-hidden rounded-full bg-muted">
      {componentes(linha).map((c) => {
        const fator = FATORES.find((f) => f.id === c.id)!;
        return (
          <span
            key={c.id}
            title={`${fator.label}: ${Math.round(c.valor)} de ${c.maximo}`}
            className={fator.cor}
            style={{ width: `${c.valor}%` }}
          />
        );
      })}
    </div>
  );
}

function Prospeccao() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [busca, setBusca] = useState("");
  const [classificacao, setClassificacao] = useState("todas");
  const [segmento, setSegmento] = useState("todos");
  const [recencia, setRecencia] = useState("12");
  const [soComTelefone, setSoComTelefone] = useState(true);
  const [montando, setMontando] = useState(false);

  const { data: fila, isLoading: carregando } = useQuery({
    queryKey: ["prospeccao", classificacao, segmento, recencia, soComTelefone],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      let q = supabase
        .from("prospeccao_ranqueada")
        .select(
          "id, nome, classificacao, macro_segmento, tickets_fluig, tickets_abertos, ultimo_ticket, telefones, emails, decisores, score, disponivel, p_uso, p_recencia, p_dor, p_porte, p_alcance",
        )
        .eq("disponivel", true)
        .order("score", { ascending: false })
        .order("tickets_fluig", { ascending: false })
        .limit(300);

      if (classificacao !== "todas") q = q.eq("classificacao", classificacao);
      if (segmento !== "todos") q = q.eq("macro_segmento", segmento);
      if (soComTelefone) q = q.gt("telefones", 0);
      if (recencia !== "todos") {
        const corte = new Date();
        corte.setMonth(corte.getMonth() - Number(recencia));
        q = q.gt("ultimo_ticket", corte.toISOString());
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Alvo[];
    },
  });

  const { data: panorama } = useQuery({
    queryKey: ["prospeccao-panorama"],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const [base, disponiveis, quentes] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase
          .from("prospeccao_ranqueada")
          .select("id", { count: "exact", head: true })
          .eq("disponivel", true),
        supabase
          .from("prospeccao_ranqueada")
          .select("id", { count: "exact", head: true })
          .eq("disponivel", true)
          .gte("score", 60),
      ]);
      return {
        base: base.count ?? 0,
        disponiveis: disponiveis.count ?? 0,
        quentes: quentes.count ?? 0,
      };
    },
  });

  const { data: ondas } = useQuery({
    queryKey: ["ondas"],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const { data: lista } = await supabase
        .from("prospect_ondas")
        .select("*")
        .order("created_at", { ascending: false });
      const { data: alvos } = await supabase
        .from("prospect_alvos")
        .select("onda_id, situacao, proxima_acao_em");
      return (lista ?? []).map((o) => {
        const meus = (alvos ?? []).filter((a) => a.onda_id === o.id);
        return {
          ...o,
          total: meus.length,
          abertos: meus.filter((a) => EM_ANDAMENTO.includes(a.situacao)).length,
          promovidos: meus.filter((a) => a.situacao === "virou_oportunidade").length,
          atrasados: meus.filter(
            (a) =>
              EM_ANDAMENTO.includes(a.situacao) &&
              a.proxima_acao_em &&
              new Date(`${a.proxima_acao_em}T23:59:59`) < new Date(),
          ).length,
        };
      });
    },
  });

  const montar = useMutation({
    mutationFn: async (form: { nome: string; quantidade: number; scoreMinimo: number }) => {
      const { data, error } = await supabase.rpc("montar_onda", {
        _nome: form.nome,
        _quantidade: form.quantidade,
        _descricao: `${classificacao === "todas" ? "todas as contas" : classificacao} · ${
          segmento === "todos" ? "todos os segmentos" : segmento
        } · ${recencia === "todos" ? "sem corte de recência" : `ativos nos últimos ${recencia} meses`}${
          soComTelefone ? " · só com telefone" : ""
        }`,
        _classificacoes: classificacao === "todas" ? null : [classificacao],
        _segmentos: segmento === "todos" ? null : [segmento],
        _score_minimo: form.scoreMinimo,
        _so_com_telefone: soComTelefone,
        _meses_recencia: recencia === "todos" ? null : Number(recencia),
      });
      if (error) throw error;
      const r = data?.[0];
      if (!r?.onda_id) throw new Error("Nenhuma empresa passou nesses filtros. Afrouxe algum critério.");
      return r;
    },
    onSuccess: (r) => {
      setMontando(false);
      qc.invalidateQueries({ queryKey: ["ondas"] });
      qc.invalidateQueries({ queryKey: ["prospeccao"] });
      toast.success(`Onda criada com ${r.selecionados} empresas.`);
      void navigate({ to: "/prospeccao/$id", params: { id: r.onda_id as string } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visiveis = useMemo(() => {
    if (!busca.trim()) return fila ?? [];
    const b = busca.toLowerCase();
    return (fila ?? []).filter((f) => f.nome.toLowerCase().includes(b));
  }, [fila, busca]);

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
        title="Prospecção"
        subtitle={
          panorama
            ? `${panorama.base.toLocaleString("pt-BR")} empresas na base · ${panorama.disponiveis.toLocaleString("pt-BR")} disponíveis · ${panorama.quentes} com score 60+`
            : "Carregando a base…"
        }
        action={
          <Dialog open={montando} onOpenChange={setMontando}>
            <DialogTrigger asChild>
              <Button disabled={(fila?.length ?? 0) === 0}>
                <Crosshair className="mr-2 h-4 w-4" /> Montar onda
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Montar onda de prospecção</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  montar.mutate({
                    nome: String(f.get("nome") ?? ""),
                    quantidade: Number(f.get("quantidade") ?? 100),
                    scoreMinimo: Number(f.get("score") ?? 0),
                  });
                }}
              >
                <p className="text-sm text-muted-foreground">
                  A onda leva as melhores empresas <strong className="text-foreground">dos filtros
                  atuais</strong>, na ordem do score. Quem já é cliente, já está no funil ou já está em
                  outra onda fica de fora.
                </p>
                <div className="space-y-1">
                  <Label htmlFor="nome">Nome da onda</Label>
                  <Input
                    id="nome"
                    name="nome"
                    required
                    defaultValue={`Onda ${new Date().toLocaleDateString("pt-BR", { month: "long" })}`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="quantidade">Quantas empresas</Label>
                    <Input id="quantidade" name="quantidade" type="number" min={1} max={500} defaultValue={100} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="score">Score mínimo</Label>
                    <Input id="score" name="score" type="number" min={0} max={100} defaultValue={50} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Lote fechado, e não fluxo infinito: é o que permite comparar depois qual critério
                  converteu mais.
                </p>
                <Button type="submit" className="w-full" disabled={montar.isPending}>
                  {montar.isPending ? "Montando…" : "Criar onda e começar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {(ondas?.length ?? 0) > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4" /> Ondas em andamento
          </h2>
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {(ondas ?? []).map((o) => (
              <li key={o.id as string}>
                <Link
                  to="/prospeccao/$id"
                  params={{ id: o.id as string }}
                  className="panel block p-4 transition-all hover:-translate-y-0.5 hover:border-primary/50"
                >
                  <p className="text-sm font-medium">{o.nome as string}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{d(o.created_at as string)}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span>
                      <strong className="text-foreground">{o.abertos}</strong>
                      <span className="text-muted-foreground"> na mesa</span>
                    </span>
                    <span>
                      <strong className="text-emerald-400">{o.promovidos}</strong>
                      <span className="text-muted-foreground"> viraram oportunidade</span>
                    </span>
                    {o.atrasados > 0 && (
                      <span className="text-amber-400">{o.atrasados} atrasado(s)</span>
                    )}
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full bg-primary"
                      style={{ width: `${o.total ? ((o.total - o.abertos) / o.total) * 100 : 0}%` }}
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel mb-4 p-4">
        <h2 className="text-sm font-semibold">Como a fila é ordenada</h2>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">
          Esta base não é lista comprada: cada empresa traz o próprio histórico de chamados de Fluig.
          É esse histórico que diz quem usa o produto, com que intensidade e se ainda está viva nele.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {FATORES.map((f) => (
            <div key={f.id} className="rounded-md border border-border p-2.5">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", f.cor)} />
                <span className="text-xs font-medium">{f.label}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">até {f.maximo}</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{f.ajuda}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar empresa…"
            className="pl-9"
          />
        </div>
        <select
          value={classificacao}
          onChange={(e) => setClassificacao(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="todas">Todas as contas</option>
          {CLASSIFICACOES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={segmento}
          onChange={(e) => setSegmento(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="todos">Todos os segmentos</option>
          {SEGMENTOS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={recencia}
          onChange={(e) => setRecencia(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="3">Ativos nos últimos 3 meses</option>
          <option value="6">Últimos 6 meses</option>
          <option value="12">Últimos 12 meses</option>
          <option value="24">Últimos 2 anos</option>
          <option value="todos">Sem corte de recência</option>
        </select>
        <button
          type="button"
          onClick={() => setSoComTelefone((v) => !v)}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
            soComTelefone
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-input text-muted-foreground hover:bg-muted",
          )}
        >
          <Phone className="h-3.5 w-3.5" /> só com telefone
        </button>
      </div>

      {carregando ? (
        <p className="text-sm text-muted-foreground">Ranqueando a base…</p>
      ) : visiveis.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 p-10 text-center">
          <Target className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Nenhuma empresa passou nesses filtros</p>
          <p className="text-sm text-muted-foreground">Afrouxe a recência ou tire o corte de telefone.</p>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            Mostrando as {visiveis.length} melhores dos filtros atuais, em ordem de score.
          </p>
          <ul className="flex flex-col gap-2">
            {visiveis.map((a, i) => {
              const faixa = faixaDoScore(a.score);
              return (
                <li key={a.id} className="panel p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-8 shrink-0 text-right font-mono text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="flex w-14 shrink-0 flex-col items-center">
                      <span className={cn("font-display text-lg font-bold leading-none", faixa.texto)}>
                        {a.score}
                      </span>
                      <Composicao linha={a} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/clientes/$id"
                        params={{ id: a.id }}
                        className="block truncate text-sm font-medium hover:text-primary"
                      >
                        {a.nome}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {porQue(a).join(" · ")}
                      </p>
                    </div>
                    <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                      <p>{a.classificacao ?? "—"}</p>
                      <p>{a.macro_segmento ?? "—"}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </AppShell>
  );
}
