import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Mail, Phone, PhoneOff, Rocket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMe } from "@/lib/auth";
import { d } from "@/lib/crm";
import {
  CANAIS,
  EM_ANDAMENTO,
  MOTIVOS_DESCARTE,
  SITUACOES_ALVO,
  corSituacaoAlvo,
  faixaDoScore,
  quandoDia,
  rotuloSituacaoAlvo,
  type SituacaoAlvoId,
} from "@/lib/prospeccao";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/prospeccao_/$id")({
  head: () => ({
    meta: [{ title: "Onda de prospecção | AB Solutions CRM" }],
  }),
  component: Onda,
});

type Contato = { nome: string; email: string | null; telefone: string | null; cargo: string | null };

type Alvo = {
  id: string;
  client_id: string;
  score: number;
  situacao: string;
  tentativas: number;
  ultimo_contato_em: string | null;
  proxima_acao_em: string | null;
  canal: string | null;
  observacao: string | null;
  motivo_descarte: string | null;
  deal_id: string | null;
  componentes: Record<string, unknown>;
  clients: { id: string; nome: string; classificacao: string | null } | null;
};

function emDias(dias: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + dias);
  return dt.toISOString().slice(0, 10);
}

function Onda() {
  const { id } = Route.useParams();
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [aba, setAba] = useState<"hoje" | "mesa" | "todos">("hoje");
  const [promovendo, setPromovendo] = useState<Alvo | null>(null);
  const [descartando, setDescartando] = useState<Alvo | null>(null);

  const { data: onda } = useQuery({
    queryKey: ["onda", id],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const { data, error } = await supabase.from("prospect_ondas").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: alvos } = useQuery({
    queryKey: ["onda-alvos", id],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prospect_alvos")
        .select("*, clients(id, nome, classificacao)")
        .eq("onda_id", id)
        .order("score", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Alvo[];
    },
  });

  // Telefones e e-mails de quem está na onda, para não precisar sair da tela
  // para descobrir com quem falar.
  const { data: contatos } = useQuery({
    queryKey: ["onda-contatos", id],
    enabled: !!alvos && alvos.length > 0,
    queryFn: async () => {
      const ids = (alvos ?? []).map((a) => a.client_id);
      const { data } = await supabase
        .from("contacts")
        .select("client_id, nome, email, telefone, cargo, is_decisor")
        .in("client_id", ids)
        .order("is_decisor", { ascending: false });
      const mapa: Record<string, Contato[]> = {};
      for (const c of data ?? []) {
        (mapa[c.client_id as string] ??= []).push(c as unknown as Contato);
      }
      return mapa;
    },
  });

  const mudar = useMutation({
    mutationFn: async ({ alvo, campos }: { alvo: string; campos: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("prospect_alvos")
        .update(campos as never)
        .eq("id", alvo);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onda-alvos", id] });
      qc.invalidateQueries({ queryKey: ["ondas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Registra a tentativa e já agenda o próximo toque. */
  const registrarTentativa = (a: Alvo, canal: string) =>
    mudar.mutate({
      alvo: a.id,
      campos: {
        situacao: a.situacao === "a_contatar" ? "tentando" : a.situacao,
        tentativas: a.tentativas + 1,
        ultimo_contato_em: new Date().toISOString(),
        canal,
        // Três dias é o intervalo que mantém a cadência viva sem virar
        // perseguição. Sem próxima data, o alvo apodrece em silêncio.
        proxima_acao_em: emDias(3),
      },
    });

  const promover = useMutation({
    mutationFn: async (form: { alvo: string; titulo: string; valor: string; previsao: string }) => {
      const { data, error } = await supabase.rpc("promover_alvo", {
        _alvo: form.alvo,
        _titulo: form.titulo,
        _valor: form.valor ? Number(form.valor) : null,
        _previsao: form.previsao || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setPromovendo(null);
      qc.invalidateQueries({ queryKey: ["onda-alvos", id] });
      qc.invalidateQueries({ queryKey: ["ondas"] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      toast.success("Virou oportunidade no funil.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resumo = useMemo(() => {
    const lista = alvos ?? [];
    const hoje = new Date().toISOString().slice(0, 10);
    return {
      total: lista.length,
      naMesa: lista.filter((a) => EM_ANDAMENTO.includes(a.situacao)).length,
      paraHoje: lista.filter(
        (a) => EM_ANDAMENTO.includes(a.situacao) && (!a.proxima_acao_em || a.proxima_acao_em <= hoje),
      ).length,
      responderam: lista.filter((a) => a.situacao === "respondeu" || a.situacao === "reuniao_marcada")
        .length,
      promovidos: lista.filter((a) => a.situacao === "virou_oportunidade").length,
      descartados: lista.filter((a) => a.situacao === "descartado").length,
      tentativas: lista.reduce((s, a) => s + a.tentativas, 0),
    };
  }, [alvos]);

  const visiveis = useMemo(() => {
    const lista = alvos ?? [];
    const hoje = new Date().toISOString().slice(0, 10);
    if (aba === "hoje")
      return lista.filter(
        (a) => EM_ANDAMENTO.includes(a.situacao) && (!a.proxima_acao_em || a.proxima_acao_em <= hoje),
      );
    if (aba === "mesa") return lista.filter((a) => EM_ANDAMENTO.includes(a.situacao));
    return lista;
  }, [alvos, aba]);

  if (isLoading) return <AppShell>Carregando…</AppShell>;
  if (!me?.isStaff)
    return (
      <AppShell>
        <NoAccess />
      </AppShell>
    );
  if (!onda)
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Onda não encontrada.</p>
      </AppShell>
    );

  const taxa = resumo.total ? Math.round((resumo.promovidos / resumo.total) * 100) : 0;

  return (
    <AppShell>
      <Link
        to="/prospeccao"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para a prospecção
      </Link>

      <div className="panel mb-4 p-5">
        <h1 className="font-display text-xl font-semibold">{onda.nome as string}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {d(onda.created_at as string)} · {(onda.descricao as string) ?? "sem critério registrado"}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-5">
          {[
            { r: "Na mesa", v: resumo.naMesa },
            { r: "Para hoje", v: resumo.paraHoje, alerta: resumo.paraHoje > 0 },
            { r: "Responderam", v: resumo.responderam },
            { r: "Viraram oportunidade", v: resumo.promovidos, bom: true },
            { r: "Descartados", v: resumo.descartados },
          ].map((x) => (
            <div key={x.r}>
              <p className="text-[11px] text-muted-foreground">{x.r}</p>
              <p
                className={cn(
                  "font-display text-xl font-semibold",
                  x.alerta && "text-amber-400",
                  x.bom && x.v > 0 && "text-emerald-400",
                )}
              >
                {x.v}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {resumo.tentativas} tentativa(s) feitas · {taxa}% da onda virou oportunidade
          {resumo.promovidos > 0 && " — compare com a próxima onda para saber se o critério melhorou"}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-border">
        {(
          [
            { id: "hoje", label: "Para hoje", n: resumo.paraHoje },
            { id: "mesa", label: "Na mesa", n: resumo.naMesa },
            { id: "todos", label: "Todos", n: resumo.total },
          ] as const
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
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px]",
                aba === x.id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              {x.n}
            </span>
          </button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <div className="panel p-10 text-center">
          <p className="text-sm font-medium">
            {aba === "hoje" ? "Nada para hoje. A fila do dia está limpa." : "Nada por aqui."}
          </p>
          {aba === "hoje" && resumo.naMesa > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              Ainda há {resumo.naMesa} empresa(s) na mesa, com toque agendado para outro dia.
            </p>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visiveis.map((a) => {
            const faixa = faixaDoScore(a.score);
            const gente = contatos?.[a.client_id] ?? [];
            const principal = gente[0];
            const atrasado =
              a.proxima_acao_em && EM_ANDAMENTO.includes(a.situacao)
                ? new Date(`${a.proxima_acao_em}T23:59:59`) < new Date()
                : false;

            return (
              <li key={a.id} className={cn("panel p-4", atrasado && "border-amber-500/30")}>
                <div className="flex flex-wrap items-start gap-3">
                  <span className={cn("font-display text-lg font-bold leading-none", faixa.texto)}>
                    {a.score}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/clientes/$id"
                        params={{ id: a.client_id }}
                        className="text-sm font-medium hover:text-primary"
                      >
                        {a.clients?.nome}
                      </Link>
                      <span
                        className={cn(
                          "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px]",
                          corSituacaoAlvo(a.situacao),
                        )}
                      >
                        {rotuloSituacaoAlvo(a.situacao)}
                      </span>
                      {a.tentativas > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          {a.tentativas} tentativa(s)
                        </span>
                      )}
                      {a.proxima_acao_em && EM_ANDAMENTO.includes(a.situacao) && (
                        <span className={cn("text-[11px]", atrasado ? "text-amber-400" : "text-muted-foreground")}>
                          próximo toque {quandoDia(a.proxima_acao_em)}
                        </span>
                      )}
                    </div>

                    {principal ? (
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="text-foreground">{principal.nome}</span>
                        {principal.cargo && <span>{principal.cargo}</span>}
                        {principal.telefone && (
                          <a href={`tel:${principal.telefone}`} className="inline-flex items-center gap-1 hover:text-primary">
                            <Phone className="h-3 w-3" /> {principal.telefone}
                          </a>
                        )}
                        {principal.email && (
                          <a href={`mailto:${principal.email}`} className="inline-flex items-center gap-1 hover:text-primary">
                            <Mail className="h-3 w-3" /> {principal.email}
                          </a>
                        )}
                        {gente.length > 1 && <span>+{gente.length - 1} contato(s)</span>}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Sem contato cadastrado.</p>
                    )}

                    {a.observacao && (
                      <p className="mt-1 text-xs text-muted-foreground">{a.observacao}</p>
                    )}
                    {a.motivo_descarte && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Descartado: {a.motivo_descarte}
                      </p>
                    )}
                  </div>

                  {EM_ANDAMENTO.includes(a.situacao) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {CANAIS.slice(0, 3).map((canal) => (
                        <button
                          key={canal}
                          type="button"
                          title={`Registrar tentativa por ${canal} e agendar o próximo toque em 3 dias`}
                          onClick={() => registrarTentativa(a, canal)}
                          className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                        >
                          {canal}
                        </button>
                      ))}
                      <select
                        value={a.situacao}
                        onChange={(e) =>
                          mudar.mutate({ alvo: a.id, campos: { situacao: e.target.value as SituacaoAlvoId } })
                        }
                        className="h-7 rounded-md border border-input bg-transparent px-2 text-[11px]"
                      >
                        {SITUACOES_ALVO.filter((s) => EM_ANDAMENTO.includes(s.id)).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <Button size="sm" onClick={() => setPromovendo(a)}>
                        <Rocket className="mr-1.5 h-3.5 w-3.5" /> Oportunidade
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDescartando(a)}>
                        <PhoneOff className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  )}

                  {a.deal_id && (
                    <Link
                      to="/funil"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      ver no funil <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Promover ao funil */}
      <Dialog open={!!promovendo} onOpenChange={(v) => !v && setPromovendo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Virar oportunidade</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              promover.mutate({
                alvo: promovendo!.id,
                titulo: String(f.get("titulo") ?? ""),
                valor: String(f.get("valor") ?? ""),
                previsao: String(f.get("previsao") ?? ""),
              });
            }}
          >
            <p className="text-sm text-muted-foreground">
              {promovendo?.clients?.nome} entra no funil como oportunidade e sai da fila de abordagem
              fria. Aqui é onde valor e previsão passam a fazer sentido.
            </p>
            <div className="space-y-1">
              <Label htmlFor="titulo">O que está sendo proposto</Label>
              <Input
                id="titulo"
                name="titulo"
                required
                defaultValue="Sustentação e evolução TOTVS Fluig"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="valor">Valor estimado</Label>
                <Input id="valor" name="valor" type="number" step="0.01" placeholder="9800" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="previsao">Previsão</Label>
                <Input id="previsao" name="previsao" type="date" />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={promover.isPending}>
              {promover.isPending ? "Promovendo…" : "Criar oportunidade"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Descartar */}
      <Dialog open={!!descartando} onOpenChange={(v) => !v && setDescartando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Descartar da onda</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O motivo importa: é ele que ensina o critério da próxima onda. "Não usa mais o Fluig"
            repetido muitas vezes significa que o corte de recência está frouxo.
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            {MOTIVOS_DESCARTE.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  mudar.mutate({
                    alvo: descartando!.id,
                    campos: { situacao: "descartado", motivo_descarte: m, proxima_acao_em: null },
                  });
                  setDescartando(null);
                }}
                className="rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-accent/40"
              >
                {m}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
