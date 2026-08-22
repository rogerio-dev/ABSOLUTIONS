import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Hand, Inbox, LifeBuoy, MailWarning, Plus, RefreshCw, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { PrioridadeTag, SlaTag, StatusTag, quandoRelativo } from "@/components/TicketBits";
import { AvatarAgente, useAgentes, nomeDoAgente, type Agente } from "@/components/Responsavel";
import { AoVivo } from "@/components/AoVivo";
import { intervaloDeRecarga, useSuporteAoVivo } from "@/lib/suporte-tempo-real";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { despacharEmails } from "@/lib/suporte-email";
import { useMe } from "@/lib/auth";
import { ENCERRADOS, PRIORIDADES, TICKET_STATUS, lerEmails, urgencia } from "@/lib/suporte";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tickets")({
  head: () => ({
    meta: [
      { title: "Suporte | AB Solutions" },
      { name: "description", content: "Chamados de suporte TOTVS Fluig com SLA de resposta e resolução." },
    ],
  }),
  component: Tickets,
});

type Ticket = {
  id: string;
  numero: number;
  assunto: string;
  status: string;
  prioridade: string;
  aberto_em: string;
  prazo_primeira_resposta: string | null;
  primeira_resposta_em: string | null;
  prazo_resolucao: string | null;
  resolvido_em: string | null;
  pausado_desde: string | null;
  responsavel_id: string | null;
  solicitante_nome: string | null;
  solicitante_email: string;
  clients: { nome: string } | null;
  support_inboxes: { nome: string } | null;
  ticket_categorias: { nome: string } | null;
};

type Aba = "caixa" | "meus" | "todos" | "equipe";

/** Estourou o prazo que vale agora: o de primeira resposta, ou o de resolução. */
function estourado(t: Ticket): boolean {
  if (t.pausado_desde) return false;
  const alvo = t.primeira_resposta_em ? t.prazo_resolucao : t.prazo_primeira_resposta;
  return !!alvo && new Date(alvo).getTime() < Date.now();
}

const TRINTA_DIAS = 30 * 24 * 60 * 60 * 1000;

function resumoDoAgente(a: Agente, abertos: Ticket[], todos: Ticket[]) {
  const meus = abertos.filter((t) => t.responsavel_id === a.id);
  return {
    id: a.id as string | null,
    nome: a.nome ?? a.email ?? "—",
    papel: a.papel as string | null,
    abertos: meus.length,
    estourados: meus.filter(estourado).length,
    pendentes: meus.filter((t) => t.status === "aguardando_cliente").length,
    emEspera: meus.filter((t) => t.status === "em_espera").length,
    resolvidos30: todos.filter(
      (t) =>
        t.responsavel_id === a.id &&
        t.resolvido_em &&
        Date.now() - new Date(t.resolvido_em).getTime() < TRINTA_DIAS,
    ).length,
  };
}

function Tickets() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("abertos");
  const [filtroCaixa, setFiltroCaixa] = useState<string>("todas");
  const [abrindo, setAbrindo] = useState(false);
  const [aba, setAba] = useState<Aba>("caixa");
  // Quando o admin clica em um analista na visão de equipe, a lista passa a
  // mostrar só os chamados dele.
  const [analistaFoco, setAnalistaFoco] = useState<string | null>(null);
  const { aoVivo } = useSuporteAoVivo();

  const { data: tickets, isLoading: carregando } = useQuery({
    queryKey: ["tickets"],
    enabled: !!me,
    // O Realtime avisa na hora; isto é a rede de segurança para quando o canal
    // cai. Voltar para a aba também recarrega, que é quando mais importa.
    refetchInterval: intervaloDeRecarga(aoVivo),
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(
          "id, numero, assunto, status, prioridade, aberto_em, prazo_primeira_resposta, primeira_resposta_em, prazo_resolucao, resolvido_em, pausado_desde, responsavel_id, solicitante_nome, solicitante_email, clients(nome), support_inboxes(nome), ticket_categorias(nome)",
        )
        .order("aberto_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Ticket[];
    },
  });

  const { data: agentes } = useAgentes(!!me?.isSuporte);

  const { data: caixas } = useQuery({
    queryKey: ["caixas"],
    enabled: !!me?.isSuporte,
    queryFn: async () => {
      const { data } = await supabase.from("support_inboxes").select("id, nome").eq("ativa", true).order("nome");
      return data ?? [];
    },
  });

  // O cliente só consegue abrir chamado se a equipe tiver habilitado o suporte.
  const { data: habilitado } = useQuery({
    queryKey: ["suporte-habilitado", me?.clientId],
    enabled: !!me && !me.isSuporte && !!me.clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("client_support")
        .select("habilitado")
        .eq("client_id", me!.clientId!)
        .maybeSingle();
      return data?.habilitado ?? false;
    },
  });

  // Ao abrir a fila, tenta despachar o que ficou pendente. Sem isso, uma queda
  // momentanea do SMTP deixaria mensagens paradas ate alguem responder algo.
  const despacho = useQuery({
    queryKey: ["despachar-emails"],
    enabled: !!me?.isSuporte,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const r = await despacharEmails({ data: {} });
      if (r.enviados > 0) qc.invalidateQueries({ queryKey: ["emails-pendentes"] });
      return r;
    },
  });

  const { data: pendentes } = useQuery({
    queryKey: ["emails-pendentes"],
    enabled: !!me?.isSuporte,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("ticket_email_outbox")
        .select("id", { count: "exact", head: true })
        .is("enviado_em", null);
      return count ?? 0;
    },
  });

  const reenviar = useMutation({
    mutationFn: async () => despacharEmails({ data: {} }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["emails-pendentes"] });
      if (!r.configurado) toast.error("SMTP nao configurado no ambiente.");
      else if (r.enviados) toast.success(`${r.enviados} e-mail(s) enviado(s).`);
      else if (r.falhas) toast.error(`${r.falhas} falha(s) no envio. Veja o log do servidor.`);
      else toast.info("Nada pendente na fila.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assumir = useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase
        .from("tickets")
        .update({ responsavel_id: me!.userId })
        .eq("id", ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Chamado assumido. Ele está em Meus chamados.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visiveis = useMemo(() => {
    let lista = tickets ?? [];

    // A aba escolhe o recorte; os filtros abaixo refinam dentro dele.
    if (me?.isSuporte) {
      if (aba === "caixa") lista = lista.filter((t) => !t.responsavel_id && !ENCERRADOS.includes(t.status));
      else if (aba === "meus") lista = lista.filter((t) => t.responsavel_id === me.userId);
      if (analistaFoco) lista = lista.filter((t) => t.responsavel_id === analistaFoco);
    }

    if (filtroStatus === "abertos") lista = lista.filter((t) => !ENCERRADOS.includes(t.status));
    else if (filtroStatus !== "todos") lista = lista.filter((t) => t.status === filtroStatus);
    if (filtroCaixa !== "todas") lista = lista.filter((t) => t.support_inboxes?.nome === filtroCaixa);
    if (busca.trim()) {
      const b = busca.toLowerCase();
      lista = lista.filter(
        (t) =>
          t.assunto.toLowerCase().includes(b) ||
          String(t.numero).includes(b) ||
          (t.clients?.nome ?? "").toLowerCase().includes(b),
      );
    }
    return [...lista].sort((a, b) => urgencia(a) - urgencia(b));
  }, [tickets, aba, analistaFoco, filtroStatus, filtroCaixa, busca, me?.isSuporte, me?.userId]);

  const contagem = useMemo(() => {
    const lista = tickets ?? [];
    const abertos = lista.filter((t) => !ENCERRADOS.includes(t.status));
    return {
      abertos: abertos.length,
      estourados: abertos.filter(estourado).length,
      semDono: abertos.filter((t) => !t.responsavel_id).length,
      meus: lista.filter((t) => t.responsavel_id === me?.userId && !ENCERRADOS.includes(t.status)).length,
      total: lista.length,
    };
  }, [tickets, me?.userId]);

  // Carga por analista, para o admin ver a fila do time de uma vez.
  const porAnalista = useMemo(() => {
    if (!me?.isAdmin) return [];
    const abertos = (tickets ?? []).filter((t) => !ENCERRADOS.includes(t.status));
    const linhas = (agentes ?? []).map((a) => resumoDoAgente(a, abertos, tickets ?? []));
    const orfaos = abertos.filter((t) => !t.responsavel_id);
    return [
      ...linhas.filter((l) => l.abertos > 0 || l.resolvidos30 > 0),
      ...(orfaos.length
        ? [{ id: null, nome: "Sem responsável", papel: null, abertos: orfaos.length, estourados: orfaos.filter(estourado).length, pendentes: 0, emEspera: 0, resolvidos30: 0 }]
        : []),
    ].sort((a, b) => b.abertos - a.abertos);
  }, [agentes, tickets, me?.isAdmin]);

  if (isLoading) return <AppShell>Carregando…</AppShell>;
  if (!me?.isSuporte && !me?.clientId)
    return (
      <AppShell>
        <NoAccess />
      </AppShell>
    );

  return (
    <AppShell>
      <PageHeader
        title="Suporte"
        subtitle={
          me.isSuporte
            ? `${contagem.abertos} em aberto · ${contagem.semDono} sem responsável${contagem.estourados ? ` · ${contagem.estourados} fora do prazo` : ""}`
            : "Seus chamados abertos com a AB Solutions"
        }
        action={
          !me.isSuporte && habilitado ? (
            <Dialog open={abrindo} onOpenChange={setAbrindo}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Abrir chamado
                </Button>
              </DialogTrigger>
              <NovoChamado
                clientId={me.clientId!}
                email={me.email ?? ""}
                nome={me.fullName ?? ""}
                aoCriar={() => {
                  setAbrindo(false);
                  qc.invalidateQueries({ queryKey: ["tickets"] });
                }}
              />
            </Dialog>
          ) : null
        }
      />

      {!me.isSuporte && habilitado === false && (
        <div className="panel mb-4 flex items-start gap-3 p-4">
          <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Suporte ainda não habilitado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A abertura de chamados por este portal não está liberada para a sua empresa. Fale com a equipe da AB
              Solutions para ativar.
            </p>
          </div>
        </div>
      )}

      {me.isSuporte && (pendentes ?? 0) > 0 && (
        <div className="panel mb-4 flex flex-wrap items-center gap-3 border-amber-500/30 bg-amber-500/5 p-4">
          <MailWarning className="h-5 w-5 shrink-0 text-amber-300" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-200">
              {pendentes} mensagem(ns) aguardando envio por e-mail
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {despacho.isError
                ? "Nao foi possivel contatar o servidor de envio. Nada foi perdido."
                : despacho.data?.configurado === false
                  ? "O SMTP nao esta configurado no ambiente; as mensagens ficam guardadas ate ele existir."
                  : "O envio falhou nas ultimas tentativas. Nada foi perdido."}
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={reenviar.isPending} onClick={() => reenviar.mutate()}>
            <RefreshCw className={reenviar.isPending ? "mr-2 h-3.5 w-3.5 animate-spin" : "mr-2 h-3.5 w-3.5"} />
            Reenviar
          </Button>
        </div>
      )}

      {me.isSuporte && (
        <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-border">
          <span className="order-last ml-auto pb-2 pl-3">
            <AoVivo ativo={aoVivo} />
          </span>
          {(
            [
              { id: "caixa", label: "Caixa geral", n: contagem.semDono },
              { id: "meus", label: "Meus chamados", n: contagem.meus },
              { id: "todos", label: "Todos", n: contagem.abertos },
              ...(me.isAdmin ? [{ id: "equipe" as const, label: "Por analista", n: null }] : []),
            ] as { id: Aba; label: string; n: number | null }[]
          ).map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => {
                setAba(x.id);
                setAnalistaFoco(null);
              }}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                aba === x.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {x.id === "equipe" && <Users className="h-4 w-4" />}
              {x.label}
              {x.n !== null && (
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
      )}

      {aba === "caixa" && me.isSuporte && contagem.semDono > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          Chamados ainda sem dono. Assumir um tira ele daqui e coloca em Meus chamados.
        </p>
      )}

      {aba === "equipe" && me.isAdmin && (
        <div className="panel mb-4 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Analista</th>
                <th className="px-3 py-3 text-right font-medium">Em aberto</th>
                <th className="px-3 py-3 text-right font-medium">Fora do prazo</th>
                <th className="px-3 py-3 text-right font-medium">Pendentes</th>
                <th className="px-3 py-3 text-right font-medium">Em espera</th>
                <th className="px-4 py-3 text-right font-medium">Resolvidos (30d)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {porAnalista.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    Ninguém com chamados no momento.
                  </td>
                </tr>
              ) : (
                porAnalista.map((l) => (
                  <tr
                    key={l.id ?? "orfaos"}
                    onClick={() => {
                      if (l.id) {
                        setAnalistaFoco(l.id);
                        setAba("todos");
                      } else {
                        setAba("caixa");
                      }
                    }}
                    className="cursor-pointer transition-colors hover:bg-accent/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <AvatarAgente nome={l.id ? l.nome : null} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{l.nome}</p>
                          {l.papel && <p className="text-[11px] text-muted-foreground">{l.papel}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{l.abertos}</td>
                    <td className={cn("px-3 py-3 text-right tabular-nums", l.estourados > 0 && "font-semibold text-rose-400")}>
                      {l.estourados}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{l.pendentes}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{l.emEspera}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{l.resolvidos30}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {analistaFoco && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            Mostrando os chamados de <strong className="text-foreground">{nomeDoAgente(agentes, analistaFoco)}</strong>
          </span>
          <button
            type="button"
            onClick={() => setAnalistaFoco(null)}
            className="text-xs text-primary hover:underline"
          >
            limpar
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por número, assunto ou cliente…"
            className="pl-9"
          />
        </div>

        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="abertos">Em aberto</option>
          <option value="todos">Todos</option>
          {TICKET_STATUS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        {me.isSuporte && (caixas?.length ?? 0) > 1 && (
          <select
            value={filtroCaixa}
            onChange={(e) => setFiltroCaixa(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="todas">Todas as caixas</option>
            {caixas!.map((c) => (
              <option key={c.id as string} value={c.nome as string}>
                {c.nome as string}
              </option>
            ))}
          </select>
        )}
      </div>

      {aba === "equipe" && me.isAdmin && !analistaFoco ? null : carregando ? (
        <p className="text-sm text-muted-foreground">Carregando chamados…</p>
      ) : visiveis.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 p-10 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Nenhum chamado por aqui</p>
          <p className="text-sm text-muted-foreground">
            {!me.isSuporte
              ? "Quando você abrir um chamado, ele aparece nesta lista."
              : aba === "caixa"
                ? "Nada esperando dono. Todo chamado aberto já tem responsável."
                : aba === "meus"
                  ? "Você não tem chamados atribuídos. Pegue um na caixa geral."
                  : "A fila está limpa."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visiveis.map((t) => {
            const respondido = !!t.primeira_resposta_em;
            return (
              <li key={t.id}>
                <Link
                  to="/tickets/$id"
                  params={{ id: t.id }}
                  className="panel block p-4 transition-all hover:-translate-y-0.5 hover:border-primary/50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">#{t.numero}</span>
                    <span className="flex-1 text-sm font-medium">{t.assunto}</span>
                    <StatusTag status={t.status} />
                    <PrioridadeTag prioridade={t.prioridade} />
                    {me.isSuporte && !t.responsavel_id && !ENCERRADOS.includes(t.status) && (
                      <button
                        type="button"
                        disabled={assumir.isPending}
                        onClick={(e) => {
                          // O cartão inteiro é um link; sem isto, assumir abriria o chamado.
                          e.preventDefault();
                          e.stopPropagation();
                          assumir.mutate(t.id);
                        }}
                        className="inline-flex items-center gap-1 rounded border border-primary/40 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                      >
                        <Hand className="h-3 w-3" /> Assumir
                      </button>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {me.isSuporte && t.clients?.nome && <span className="font-medium text-foreground">{t.clients.nome}</span>}
                    {t.ticket_categorias?.nome && <span>{t.ticket_categorias.nome}</span>}
                    <span>{t.solicitante_nome || t.solicitante_email}</span>
                    <span>aberto {quandoRelativo(t.aberto_em)}</span>
                    {me.isSuporte && t.support_inboxes?.nome && <span>caixa: {t.support_inboxes.nome}</span>}
                    {me.isSuporte && (
                      <span className="inline-flex items-center gap-1.5">
                        <AvatarAgente nome={nomeDoAgente(agentes, t.responsavel_id)} className="h-5 w-5 text-[9px]" />
                        {nomeDoAgente(agentes, t.responsavel_id) ?? "sem responsável"}
                      </span>
                    )}
                  </div>

                  {!ENCERRADOS.includes(t.status) && (
                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      {!respondido && (
                        <SlaTag rotulo="1ª resposta" prazo={t.prazo_primeira_resposta} pausado={!!t.pausado_desde} />
                      )}
                      <SlaTag
                        rotulo="resolução"
                        prazo={t.prazo_resolucao}
                        cumpridoEm={t.resolvido_em}
                        pausado={!!t.pausado_desde}
                      />
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}

/** Formulário de abertura, usado pelo cliente no portal. */
function NovoChamado({
  clientId,
  email,
  nome,
  aoCriar,
}: {
  clientId: string;
  email: string;
  nome: string;
  aoCriar: () => void;
}) {
  const [copias, setCopias] = useState("");

  const { data: categorias } = useQuery({
    queryKey: ["categorias-ticket"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ticket_categorias")
        .select("id, nome, descricao")
        .eq("ativa", true)
        .order("ordem");
      return data ?? [];
    },
  });

  const criar = useMutation({
    mutationFn: async (form: { assunto: string; descricao: string; categoria: string; prioridade: string }) => {
      const { validos, invalidos } = lerEmails(copias);
      if (invalidos.length) throw new Error(`E-mail inválido em cópia: ${invalidos.join(", ")}`);

      const { data: novo, error } = await supabase
        .from("tickets")
        .insert({
          client_id: clientId,
          assunto: form.assunto,
          descricao: form.descricao,
          categoria_id: form.categoria || null,
          prioridade: form.prioridade as "critica" | "alta" | "media" | "baixa",
          status: "novo",
          canal: "portal",
          solicitante_email: email.toLowerCase(),
          solicitante_nome: nome,
        })
        .select("id, numero")
        .single();
      if (error) throw error;

      // A descrição vira a primeira mensagem, para a conversa ficar completa.
      await supabase.from("ticket_messages").insert({
        ticket_id: novo.id,
        tipo: "publica",
        canal: "portal",
        corpo: form.descricao,
        autor_nome: nome,
        autor_email: email.toLowerCase(),
      });

      if (validos.length) {
        await supabase
          .from("ticket_watchers")
          .insert(validos.map((e) => ({ ticket_id: novo.id, email: e })));
      }
      await despacharEmails({ data: { ticketId: novo.id } }).catch(() => undefined);
      return novo.numero;
    },
    onSuccess: (numero) => {
      toast.success(`Chamado #${numero} aberto. Você receberá as atualizações por e-mail.`);
      aoCriar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Abrir chamado</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          criar.mutate({
            assunto: String(f.get("assunto") ?? ""),
            descricao: String(f.get("descricao") ?? ""),
            categoria: String(f.get("categoria") ?? ""),
            prioridade: String(f.get("prioridade") ?? "media"),
          });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="assunto">Assunto</Label>
          <Input id="assunto" name="assunto" required placeholder="Resuma o problema em uma linha" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="categoria">Categoria</Label>
            <select
              id="categoria"
              name="categoria"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Selecione…</option>
              {(categorias ?? []).map((c) => (
                <option key={c.id as string} value={c.id as string}>
                  {c.nome as string}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="prioridade">Criticidade</Label>
            <select
              id="prioridade"
              name="prioridade"
              defaultValue="media"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {PRIORIDADES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.ajuda}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="descricao">O que está acontecendo</Label>
          <textarea
            id="descricao"
            name="descricao"
            required
            rows={5}
            placeholder="Descreva o comportamento, onde ocorre e o que já foi tentado. Se houver mensagem de erro, cole aqui."
            className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="copias">Em cópia (opcional)</Label>
          <Input
            id="copias"
            value={copias}
            onChange={(e) => setCopias(e.target.value)}
            placeholder="colega@empresa.com, gestor@empresa.com"
          />
          <p className="text-xs text-muted-foreground">
            Quem estiver em cópia recebe cada atualização por e-mail e pode responder direto pelo e-mail.
          </p>
        </div>

        <Button type="submit" className="w-full" disabled={criar.isPending}>
          {criar.isPending ? "Abrindo…" : "Abrir chamado"}
        </Button>
      </form>
    </DialogContent>
  );
}
