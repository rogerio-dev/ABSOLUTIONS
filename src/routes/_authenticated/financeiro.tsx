import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Plus,
  RefreshCw,
  Users,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FiltroSituacao, LinhaTitulo, type Titulo } from "@/components/TitulosFinanceiros";
import { useMe } from "@/lib/auth";
import { d } from "@/lib/crm";
import {
  ABERTOS,
  CATEGORIAS_DESPESA,
  MODALIDADES_PAGAMENTO,
  TIPOS_CONTA,
  TIPOS_PAGAMENTO,
  atrasado,
  competencia as fmtCompetencia,
  corModalidadePgto,
  dinheiro,
  horas,
  primeiroDiaDoMes,
  rotuloModalidadePgto,
} from "@/lib/financeiro";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro | AB Solutions CRM" },
      { name: "description", content: "Caixa, contas a receber e a pagar, e o custo de execução." },
    ],
  }),
  component: Financeiro,
});

type Aba = "panorama" | "receber" | "pagar" | "equipe" | "contas";

function Card({
  rotulo,
  valor,
  detalhe,
  cor,
  icone: Icone,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  cor?: string;
  icone?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2">
        {Icone && <Icone className={cn("h-4 w-4", cor ?? "text-muted-foreground")} />}
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      </div>
      <p className={cn("mt-1 font-display text-2xl font-bold", cor ?? "text-foreground")}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

function Financeiro() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("panorama");
  const [filtroReceber, setFiltroReceber] = useState("abertos");
  const [filtroPagar, setFiltroPagar] = useState("abertos");
  const [novoTitulo, setNovoTitulo] = useState<"receber" | "pagar" | null>(null);
  const [novoColab, setNovoColab] = useState(false);
  // "" = ninguém escolhido ainda; "avulso" = pessoa sem conta no sistema.
  const [quemExecuta, setQuemExecuta] = useState("");
  const [novaConta, setNovaConta] = useState(false);

  const habilitado = !!me?.isAdmin;
  const recarregar = () => {
    for (const k of ["recebimentos", "pagamentos", "fin-contas", "fin-colaboradores",
                     "fin-projecao", "fin-horas", "execucao-sem-ficha"])
      qc.invalidateQueries({ queryKey: [k] });
  };

  const { data: contas } = useQuery({
    queryKey: ["fin-contas"],
    enabled: habilitado,
    queryFn: async () => {
      const { data } = await supabase.from("saldo_das_contas").select("*").order("nome");
      return data ?? [];
    },
  });

  const { data: receber } = useQuery({
    queryKey: ["recebimentos"],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recebimentos")
        .select("*, clients(nome)")
        .order("vencimento");
      if (error) throw error;
      return (data ?? []) as unknown as Titulo[];
    },
  });

  const { data: pagar } = useQuery({
    queryKey: ["pagamentos"],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagamentos")
        .select("*, colaboradores(nome)")
        .order("vencimento");
      if (error) throw error;
      return (data ?? []) as unknown as Titulo[];
    },
  });

  const { data: colaboradores } = useQuery({
    queryKey: ["fin-colaboradores"],
    enabled: habilitado,
    queryFn: async () => {
      const [{ data: pessoas }, { data: horasPorPessoa }] = await Promise.all([
        supabase.from("colaboradores").select("*").order("ativo", { ascending: false }).order("nome"),
        supabase.from("colaborador_horas").select("*"),
      ]);
      return (pessoas ?? []).map((p) => ({
        ...p,
        h: (horasPorPessoa ?? []).find((x) => x.id === p.id),
      }));
    },
  });

  const { data: projecao } = useQuery({
    queryKey: ["fin-projecao"],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("projecao_financeira", { _meses: 6 });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: projetos } = useQuery({
    queryKey: ["fin-horas"],
    enabled: habilitado,
    queryFn: async () => {
      const { data } = await supabase.from("projeto_horas").select("*").order("nome");
      return data ?? [];
    },
  });

  /*
   * Só gente de casa. A lista antiga vinha de `profiles` inteira e trazia
   * cliente junto — vincular um colaborador a um cliente criaria ficha de
   * pagamento para quem paga, não para quem recebe.
   */
  const { data: equipe } = useQuery({
    queryKey: ["equipe-interna"],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("equipe_interna");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Quem da equipe já acumula card mas ainda não tem ficha: o trabalho sai e a
  // conta não aparece.
  const { data: semFicha } = useQuery({
    queryKey: ["execucao-sem-ficha"],
    enabled: habilitado,
    queryFn: async () => {
      const { data } = await supabase.from("execucao_sem_ficha").select("*").order("nome");
      return data ?? [];
    },
  });

  const resumo = useMemo(() => {
    const r = receber ?? [];
    const p = pagar ?? [];
    const emAberto = (l: Titulo[]) => l.filter((x) => ABERTOS.includes(x.situacao));
    const soma = (l: Titulo[]) => l.reduce((s, x) => s + Number(x.valor ?? 0), 0);
    const saldo = (contas ?? []).reduce((s, c) => s + Number(c.saldo ?? 0), 0);
    const aReceber = emAberto(r);
    const aPagar = emAberto(p);
    return {
      saldo,
      aReceber: soma(aReceber),
      aPagar: soma(aPagar),
      atrasadosReceber: aReceber.filter(atrasado),
      atrasadosPagar: aPagar.filter(atrasado),
      projetado: saldo + soma(aReceber) - soma(aPagar),
    };
  }, [receber, pagar, contas]);

  const horasResumo = useMemo(() => {
    const c = colaboradores ?? [];
    return {
      pendentes: c.reduce((s, x) => s + Number(x.h?.horas_pendentes ?? 0), 0),
      aPagar: c.reduce((s, x) => s + Number(x.h?.horas_a_pagar ?? 0), 0),
      pagas: c.reduce((s, x) => s + Number(x.h?.horas_pagas ?? 0), 0),
      valorAPagar: c.reduce((s, x) => s + Number(x.h?.valor_a_pagar ?? 0), 0),
    };
  }, [colaboradores]);

  const filtrar = (lista: Titulo[] | undefined, filtro: string) => {
    let l = lista ?? [];
    if (filtro === "abertos") l = l.filter((x) => ABERTOS.includes(x.situacao));
    else if (filtro === "atrasados") l = l.filter(atrasado);
    else if (filtro !== "todos") l = l.filter((x) => x.situacao === filtro);
    return l;
  };

  const gerarMensalidades = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("gerar_mensalidades", {
        _competencia: primeiroDiaDoMes(),
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      recarregar();
      toast.success(n > 0 ? `${n} mensalidade(s) lançada(s).` : "Nada novo: o mês já estava lançado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fechar = useMutation({
    mutationFn: async (colaborador: string) => {
      const { data, error } = await supabase.rpc("fechar_colaborador", {
        _colaborador: colaborador,
        _competencia: primeiroDiaDoMes(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (id) => {
      recarregar();
      toast[id ? "success" : "info"](
        id ? "Fechamento gerado em Contas a pagar." : "Nenhum card concluído pendente de pagamento.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criarTitulo = useMutation({
    mutationFn: async (f: FormData) => {
      const tabela = novoTitulo === "receber" ? "recebimentos" : "pagamentos";
      const base = {
        descricao: String(f.get("descricao") ?? ""),
        competencia: primeiroDiaDoMes(),
        valor: Number(f.get("valor") ?? 0),
        vencimento: String(f.get("vencimento") ?? ""),
        situacao: "previsto" as const,
      };
      const extra =
        novoTitulo === "receber"
          ? { client_id: String(f.get("cliente") ?? "") }
          : {
              tipo: String(f.get("tipo") ?? "despesa"),
              categoria: String(f.get("categoria") ?? ""),
              recorrente: f.get("recorrente") === "on",
            };
      const { error } = await supabase.from(tabela).insert({ ...base, ...extra } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setNovoTitulo(null);
      recarregar();
      toast.success("Título lançado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criarColaborador = useMutation({
    mutationFn: async (f: FormData) => {
      const escolhido = String(f.get("perfil") ?? "");
      const avulso = escolhido === "avulso" || !escolhido;
      // O nome vem do perfil quando há um: uma pessoa, um nome.
      const daEquipe = (semFicha ?? []).find((p) => p.profile_id === escolhido);
      const nome = avulso ? String(f.get("nome") ?? "") : ((daEquipe?.nome as string) ?? "");
      if (!nome.trim()) throw new Error("Escolha quem executa, ou informe o nome.");

      const { error } = await supabase.from("colaboradores").insert({
        nome,
        papel: String(f.get("papel") ?? ""),
        email: avulso ? null : ((daEquipe?.email as string) ?? null),
        profile_id: avulso ? null : escolhido,
        modalidade: String(f.get("modalidade") ?? "por_task"),
        valor_hora: f.get("valor_hora") ? Number(f.get("valor_hora")) : null,
        valor_mensal: f.get("valor_mensal") ? Number(f.get("valor_mensal")) : null,
        dia_pagamento: f.get("dia") ? Number(f.get("dia")) : null,
        tipo_pessoa: String(f.get("tipo_pessoa") ?? "pj"),
        documento: String(f.get("documento") ?? ""),
        chave_pix: String(f.get("pix") ?? ""),
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setNovoColab(false);
      setQuemExecuta("");
      recarregar();
      toast.success("Pessoa cadastrada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criarConta = useMutation({
    mutationFn: async (f: FormData) => {
      const { error } = await supabase.from("financeiro_contas").insert({
        nome: String(f.get("nome") ?? ""),
        tipo: String(f.get("tipo") ?? "corrente"),
        banco: String(f.get("banco") ?? ""),
        saldo_inicial: Number(f.get("saldo") ?? 0),
        saldo_inicial_em: String(f.get("data") ?? new Date().toISOString().slice(0, 10)),
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setNovaConta(false);
      recarregar();
      toast.success("Conta criada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: clientes } = useQuery({
    queryKey: ["clientes-com-contrato"],
    enabled: habilitado && novoTitulo === "receber",
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, nome").order("nome").limit(500);
      return data ?? [];
    },
  });

  if (isLoading) return <AppShell>Carregando…</AppShell>;
  if (!habilitado)
    return (
      <AppShell>
        <NoAccess />
      </AppShell>
    );

  const contasSimples = (contas ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string }));
  const maiorProjecao = Math.max(
    1,
    ...(projecao ?? []).map((p) => Math.abs(Number(p.a_receber) + Number(p.recebido))),
  );

  return (
    <AppShell>
      <PageHeader
        title="Financeiro"
        subtitle={`${dinheiro(resumo.saldo)} em caixa · ${dinheiro(resumo.aReceber)} a receber · ${dinheiro(resumo.aPagar)} a pagar`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-border">
        {(
          [
            { id: "panorama", label: "Panorama" },
            { id: "receber", label: "A receber", n: filtrar(receber, "abertos").length },
            { id: "pagar", label: "A pagar", n: filtrar(pagar, "abertos").length },
            { id: "equipe", label: "Execução" },
            { id: "contas", label: "Contas" },
          ] as { id: Aba; label: string; n?: number }[]
        ).map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setAba(x.id)}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              aba === x.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {x.label}
            {x.n !== undefined && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[11px]",
                  aba === x.id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {x.n}
              </span>
            )}
          </button>
        ))}
      </div>

      {(resumo.atrasadosReceber.length > 0 || resumo.atrasadosPagar.length > 0) && (
        <div className="panel mb-4 flex flex-wrap items-center gap-3 border-rose-500/30 bg-rose-500/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
          <p className="flex-1 text-sm">
            <strong className="text-rose-300">
              {resumo.atrasadosReceber.length} a receber e {resumo.atrasadosPagar.length} a pagar
            </strong>{" "}
            <span className="text-muted-foreground">passaram do vencimento.</span>
          </p>
        </div>
      )}

      {aba === "panorama" && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card rotulo="Em caixa" valor={dinheiro(resumo.saldo)} icone={Wallet} cor="text-primary"
                  detalhe={`${(contas ?? []).length} conta(s)`} />
            <Card rotulo="A receber" valor={dinheiro(resumo.aReceber)} icone={ArrowDownCircle}
                  cor="text-emerald-400" detalhe={`${filtrar(receber, "abertos").length} título(s) em aberto`} />
            <Card rotulo="A pagar" valor={dinheiro(resumo.aPagar)} icone={ArrowUpCircle}
                  cor="text-rose-400" detalhe={`${filtrar(pagar, "abertos").length} título(s) em aberto`} />
            <Card rotulo="Saldo projetado" valor={dinheiro(resumo.projetado)}
                  cor={resumo.projetado >= 0 ? "text-foreground" : "text-rose-400"}
                  detalhe="Caixa mais o que entra, menos o que sai" />
          </div>

          <section className="panel mb-4 p-5">
            <h2 className="text-sm font-semibold">Custo de execução</h2>
            <p className="mb-4 mt-1 text-xs text-muted-foreground">
              As horas saem do que foi orçado em cada card, não de apontamento. Card concluído vira
              dívida; card em andamento é compromisso futuro.
            </p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <p className="text-[11px] text-muted-foreground">Ainda em execução</p>
                <p className="font-display text-xl font-semibold">{horas(horasResumo.pendentes)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Concluído, a pagar</p>
                <p className="font-display text-xl font-semibold text-amber-400">
                  {horas(horasResumo.aPagar)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Valor a pagar</p>
                <p className="font-display text-xl font-semibold text-amber-400">
                  {dinheiro(horasResumo.valorAPagar)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Já pago</p>
                <p className="font-display text-xl font-semibold text-muted-foreground">
                  {horas(horasResumo.pagas)}
                </p>
              </div>
            </div>
          </section>

          <section className="panel mb-4 p-5">
            <h2 className="text-sm font-semibold">Próximos meses</h2>
            <p className="mb-4 mt-1 text-xs text-muted-foreground">
              Entradas contra saídas por mês. As despesas marcadas como recorrentes são repetidas nos
              meses futuros — sem isso a projeção mostraria lucro que não existe.
            </p>
            <div className="overflow-x-auto">
              <div className="flex min-w-[40rem] items-end gap-3">
                {(projecao ?? []).map((p) => {
                  const entra = Number(p.a_receber) + Number(p.recebido);
                  const sai = Number(p.a_pagar) + Number(p.pago) + Number(p.recorrentes);
                  const res = Number(p.resultado);
                  return (
                    <div key={p.mes as string} className="flex-1">
                      <div className="flex h-28 items-end gap-1">
                        <div className="flex-1 rounded-t bg-emerald-500/70"
                             style={{ height: `${Math.max((entra / maiorProjecao) * 100, 2)}%` }}
                             title={`Entra ${dinheiro(entra)}`} />
                        <div className="flex-1 rounded-t bg-rose-500/70"
                             style={{ height: `${Math.max((sai / maiorProjecao) * 100, 2)}%` }}
                             title={`Sai ${dinheiro(sai)}`} />
                      </div>
                      <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                        {fmtCompetencia(p.mes as string)}
                      </p>
                      <p className={cn("text-center text-[11px] font-medium",
                                       res >= 0 ? "text-emerald-400" : "text-rose-400")}>
                        {res >= 0 ? "+" : ""}
                        {Math.round(res / 100) / 10}k
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {(projetos ?? []).some((p) => Number(p.horas_livres) < 0) && (
            <div className="panel border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm font-medium text-amber-200">Projeto com card além do orçado</p>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                {(projetos ?? [])
                  .filter((p) => Number(p.horas_livres) < 0)
                  .map((p) => (
                    <li key={p.id as string}>
                      <strong className="text-foreground">{p.nome as string}</strong> — vendidas{" "}
                      {horas(Number(p.horas_orcadas))}, distribuídas {horas(Number(p.horas_nos_cards))} nos
                      cards. Passou {horas(Math.abs(Number(p.horas_livres)))}.
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}

      {aba === "receber" && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <FiltroSituacao valor={filtroReceber} aoMudar={setFiltroReceber} />
            <Button variant="outline" disabled={gerarMensalidades.isPending}
                    onClick={() => gerarMensalidades.mutate()}>
              <RefreshCw className={cn("mr-2 h-4 w-4", gerarMensalidades.isPending && "animate-spin")} />
              Lançar mensalidades do mês
            </Button>
            <Button onClick={() => setNovoTitulo("receber")}>
              <Plus className="mr-2 h-4 w-4" /> Novo título
            </Button>
          </div>
          <ul className="flex flex-col gap-2">
            {filtrar(receber, filtroReceber).map((t) => (
              <LinhaTitulo key={t.id} titulo={t} tabela="recebimentos" contas={contasSimples}
                           aoMudar={recarregar} />
            ))}
            {filtrar(receber, filtroReceber).length === 0 && (
              <p className="panel p-8 text-center text-sm text-muted-foreground">
                Nada aqui. Use "Lançar mensalidades do mês" para gerar os títulos dos contratos ativos.
              </p>
            )}
          </ul>
        </>
      )}

      {aba === "pagar" && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <FiltroSituacao valor={filtroPagar} aoMudar={setFiltroPagar} />
            <Button onClick={() => setNovoTitulo("pagar")}>
              <Plus className="mr-2 h-4 w-4" /> Nova despesa
            </Button>
          </div>
          <ul className="flex flex-col gap-2">
            {filtrar(pagar, filtroPagar).map((t) => (
              <LinhaTitulo key={t.id} titulo={t} tabela="pagamentos" contas={contasSimples}
                           aoMudar={recarregar} />
            ))}
            {filtrar(pagar, filtroPagar).length === 0 && (
              <p className="panel p-8 text-center text-sm text-muted-foreground">
                Nenhum título a pagar neste filtro.
              </p>
            )}
          </ul>
        </>
      )}

      {aba === "equipe" && (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Quem executa, como é pago e quanto está pendente. O dado bancário só o administrador vê.
            </p>
            <Button onClick={() => setNovoColab(true)}>
              <Plus className="mr-2 h-4 w-4" /> Cadastrar pessoa
            </Button>
          </div>
          {(semFicha ?? []).length > 0 && (
            <div className="panel mb-3 border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm font-medium text-amber-200">
                {(semFicha ?? []).length} pessoa(s) da equipe sem ficha financeira
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Elas recebem card no kanban, mas sem ficha o trabalho sai e a conta não aparece.
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-xs">
                {(semFicha ?? []).map((p) => (
                  <li key={p.profile_id as string} className="text-muted-foreground">
                    <strong className="text-foreground">{p.nome as string}</strong> ({p.papel as string})
                    {Number(p.horas_concluidas) > 0 || Number(p.horas_em_execucao) > 0 ? (
                      <span className="text-amber-300">
                        {" "}
                        — já tem {horas(Number(p.horas_concluidas))} concluídas e{" "}
                        {horas(Number(p.horas_em_execucao))} em execução
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className="flex flex-col gap-2">
            {(colaboradores ?? []).map((c) => (
              <li key={c.id as string} className={cn("panel p-4", !c.ativo && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{c.nome as string}</span>
                      <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px]",
                                          corModalidadePgto(c.modalidade as string))}>
                        {rotuloModalidadePgto(c.modalidade as string)}
                      </span>
                      {!c.ativo && <span className="text-[11px] text-muted-foreground">inativo</span>}
                    </div>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {c.papel && <span>{c.papel as string}</span>}
                      {c.valor_hora ? <span>{dinheiro(Number(c.valor_hora))}/hora</span> : null}
                      {c.valor_mensal ? <span>{dinheiro(Number(c.valor_mensal))}/mês</span> : null}
                      {c.dia_pagamento ? <span>paga dia {c.dia_pagamento as number}</span> : null}
                      {!c.profile_id && (
                        <span className="text-amber-400">sem conta vinculada — não recebe cards</span>
                      )}
                    </p>
                  </div>

                  <div className="flex gap-5 text-right">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Em execução</p>
                      <p className="text-sm font-medium">{horas(Number(c.h?.horas_pendentes ?? 0))}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">A pagar</p>
                      <p className="text-sm font-medium text-amber-400">
                        {horas(Number(c.h?.horas_a_pagar ?? 0))}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Valor</p>
                      <p className="text-sm font-semibold text-amber-400">
                        {dinheiro(Number(c.h?.valor_a_pagar ?? 0))}
                      </p>
                    </div>
                  </div>

                  {c.modalidade !== "sem_custo" && (
                    <Button size="sm" disabled={fechar.isPending}
                            onClick={() => fechar.mutate(c.id as string)}>
                      Fechar mês
                    </Button>
                  )}
                </div>
              </li>
            ))}
            {(colaboradores ?? []).length === 0 && (
              <p className="panel p-8 text-center text-sm text-muted-foreground">
                Ninguém cadastrado ainda. Comece pelos desenvolvedores que recebem por card.
              </p>
            )}
          </ul>

          {(projetos ?? []).length > 0 && (
            <section className="panel mt-4 p-5">
              <h2 className="mb-3 text-sm font-semibold">Horas por projeto</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[38rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-2 py-2 font-medium">Projeto</th>
                      <th className="px-2 py-2 text-right font-medium">Vendidas</th>
                      <th className="px-2 py-2 text-right font-medium">Nos cards</th>
                      <th className="px-2 py-2 text-right font-medium">Em execução</th>
                      <th className="px-2 py-2 text-right font-medium">A pagar</th>
                      <th className="px-2 py-2 text-right font-medium">Pagas</th>
                      <th className="px-2 py-2 text-right font-medium">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(projetos ?? []).map((p) => {
                      const livre = Number(p.horas_livres);
                      return (
                        <tr key={p.id as string}>
                          <td className="px-2 py-2">{p.nome as string}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{horas(Number(p.horas_orcadas))}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{horas(Number(p.horas_nos_cards))}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                            {horas(Number(p.horas_pendentes))}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-amber-400">
                            {horas(Number(p.horas_a_pagar))}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                            {horas(Number(p.horas_pagas))}
                          </td>
                          <td className={cn("px-2 py-2 text-right tabular-nums font-medium",
                                            livre < 0 ? "text-rose-400" : "text-emerald-400")}>
                            {horas(livre)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {aba === "contas" && (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              O saldo parte da foto que você informa e soma o que passou depois dela. Nada é recalculado
              desde o começo dos tempos.
            </p>
            <Button onClick={() => setNovaConta(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nova conta
            </Button>
          </div>
          <ul className="grid gap-2 md:grid-cols-2">
            {(contas ?? []).map((c) => (
              <li key={c.id as string} className="panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{c.nome as string}</p>
                    <p className="text-xs text-muted-foreground">
                      {(c.banco as string) || TIPOS_CONTA.find((t) => t.id === c.tipo)?.label}
                    </p>
                  </div>
                  <p className="font-display text-lg font-bold text-primary">
                    {dinheiro(Number(c.saldo))}
                  </p>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Foto de {d(c.saldo_inicial_em as string)}: {dinheiro(Number(c.saldo_inicial))} · entrou{" "}
                  {dinheiro(Number(c.entradas))} · saiu {dinheiro(Number(c.saidas))}
                </p>
              </li>
            ))}
            {(contas ?? []).length === 0 && (
              <p className="panel p-8 text-center text-sm text-muted-foreground md:col-span-2">
                Cadastre a conta onde o dinheiro entra. Sem ela, não há onde baixar os títulos.
              </p>
            )}
          </ul>
        </>
      )}

      {/* --- Diálogos --- */}
      <Dialog open={!!novoTitulo} onOpenChange={(v) => !v && setNovoTitulo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{novoTitulo === "receber" ? "Novo título a receber" : "Nova despesa"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              criarTitulo.mutate(new FormData(e.currentTarget));
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="descricao">Descrição</Label>
              <Input id="descricao" name="descricao" required />
            </div>
            {novoTitulo === "receber" ? (
              <div className="space-y-1">
                <Label htmlFor="cliente">Cliente</Label>
                <select id="cliente" name="cliente" required
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                  <option value="">Selecione…</option>
                  {(clientes ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="tipo">Tipo</Label>
                  <select id="tipo" name="tipo" defaultValue="despesa"
                          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                    {TIPOS_PAGAMENTO.filter((t) => t.id !== "colaborador").map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="categoria">Categoria</Label>
                  <select id="categoria" name="categoria"
                          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                    {CATEGORIAS_DESPESA.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="valor">Valor</Label>
                <Input id="valor" name="valor" type="number" step="0.01" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vencimento">Vencimento</Label>
                <Input id="vencimento" name="vencimento" type="date" required />
              </div>
            </div>
            {novoTitulo === "pagar" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="recorrente" />
                Repete todo mês (entra na projeção dos próximos meses)
              </label>
            )}
            <Button type="submit" className="w-full" disabled={criarTitulo.isPending}>
              Lançar
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={novoColab} onOpenChange={(v) => { setNovoColab(v); if (!v) setQuemExecuta(""); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cadastrar quem executa</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault();
            criarColaborador.mutate(new FormData(e.currentTarget));
          }}>
            {/*
              Começa pela pessoa, não pelo nome. Pedir nome e conta separados é
              como o mesmo dev vira "Rogério" na ficha e "Rogerio Gadelha" no
              card: dois nomes, uma pessoa, e a conta não bate.

              A lista traz só quem ainda não tem ficha — cadastrar duas para o
              mesmo perfil é recusado pelo banco, e é melhor não oferecer do que
              deixar errar.
            */}
            <div className="space-y-1">
              <Label htmlFor="perfil">Quem executa</Label>
              <select
                id="perfil"
                name="perfil"
                required
                value={quemExecuta}
                onChange={(e) => setQuemExecuta(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Escolha na equipe…</option>
                {(semFicha ?? []).map((p) => (
                  <option key={p.profile_id as string} value={p.profile_id as string}>
                    {p.nome as string} ({p.papel as string})
                  </option>
                ))}
                <option value="avulso">Alguém sem conta no sistema</option>
              </select>
              <p className="text-[11px] text-muted-foreground">
                É por esta conta que os cards do kanban chegam até a pessoa. Quem não tem conta não
                acumula horas — serve para quem você paga por fora.
              </p>
              {(semFicha ?? []).length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Toda a equipe já tem ficha. Para cadastrar mais alguém, libere o acesso primeiro em
                  Equipe &amp; Acessos.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {quemExecuta === "avulso" && (
                <div className="space-y-1">
                  <Label htmlFor="nome">Nome</Label>
                  <Input id="nome" name="nome" required placeholder="Nome de quem recebe" />
                </div>
              )}
              <div className={cn("space-y-1", quemExecuta !== "avulso" && "col-span-2")}>
                <Label htmlFor="papel">Papel</Label>
                <Input id="papel" name="papel" placeholder="Desenvolvedor Fluig" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="modalidade">Como é pago</Label>
              <select id="modalidade" name="modalidade" defaultValue="por_task"
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                {MODALIDADES_PAGAMENTO.map((m) => (
                  <option key={m.id} value={m.id}>{m.label} — {m.ajuda}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="valor_hora">Valor da hora</Label>
                <Input id="valor_hora" name="valor_hora" type="number" step="0.01" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="valor_mensal">Valor mensal</Label>
                <Input id="valor_mensal" name="valor_mensal" type="number" step="0.01" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dia">Dia do pagamento</Label>
                <Input id="dia" name="dia" type="number" min={1} max={31} defaultValue={5} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="tipo_pessoa">Pessoa</Label>
                <select id="tipo_pessoa" name="tipo_pessoa" defaultValue="pj"
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                  <option value="pj">Jurídica</option>
                  <option value="pf">Física</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="documento">CNPJ ou CPF</Label>
                <Input id="documento" name="documento" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pix">Chave PIX</Label>
                <Input id="pix" name="pix" />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={criarColaborador.isPending}>
              Cadastrar
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={novaConta} onOpenChange={setNovaConta}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova conta</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault();
            criarConta.mutate(new FormData(e.currentTarget));
          }}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="cnome">Nome</Label>
                <Input id="cnome" name="nome" required placeholder="Conta PJ Inter" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ctipo">Tipo</Label>
                <select id="ctipo" name="tipo" defaultValue="corrente"
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                  {TIPOS_CONTA.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cbanco">Banco</Label>
              <Input id="cbanco" name="banco" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="csaldo">Saldo hoje</Label>
                <Input id="csaldo" name="saldo" type="number" step="0.01" defaultValue={0} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cdata">Data da foto</Label>
                <Input id="cdata" name="data" type="date"
                       defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              A partir dessa data, tudo que for baixado nesta conta soma ou subtrai do saldo.
            </p>
            <Button type="submit" className="w-full" disabled={criarConta.isPending}>
              Criar conta
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
