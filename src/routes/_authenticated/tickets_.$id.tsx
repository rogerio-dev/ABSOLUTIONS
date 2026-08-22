import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Info, Lock, Mail, Send, UserPlus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess } from "@/components/AppShell";
import { PrioridadeTag, SlaTag, StatusTag, iniciaisDe, quandoRelativo } from "@/components/TicketBits";
import { EnviarComStatus } from "@/components/EnviarComStatus";
import { SeletorResponsavel, useAgentes, nomeDoAgente } from "@/components/Responsavel";
import { AoVivo } from "@/components/AoVivo";
import { intervaloDeRecarga, useSuporteAoVivo } from "@/lib/suporte-tempo-real";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { despacharEmails } from "@/lib/suporte-email";
import { useMe } from "@/lib/auth";
import { dt } from "@/lib/crm";
import {
  ENCERRADOS,
  PRIORIDADES,
  TICKET_STATUS,
  envioSugerido,
  lerEmails,
  type PrioridadeId,
  type StatusDeEnvioId,
  type TicketStatusId,
} from "@/lib/suporte";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tickets_/$id")({
  head: () => ({
    meta: [
      { title: "Chamado | AB Solutions" },
      { name: "description", content: "Detalhe do chamado de suporte com histórico e SLA." },
    ],
  }),
  component: TicketDetalhe,
});

type Mensagem = {
  id: string;
  tipo: "publica" | "nota_interna" | "sistema";
  canal: string;
  corpo: string;
  autor_id: string | null;
  autor_nome: string | null;
  autor_email: string | null;
  created_at: string;
};

function TicketDetalhe() {
  const { id } = Route.useParams();
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [interna, setInterna] = useState(false);
  const [novaCopia, setNovaCopia] = useState("");
  // Nulo enquanto o chamado não carregou; depois assume a sugestão do status atual.
  const [statusEnvio, setStatusEnvio] = useState<StatusDeEnvioId | null>(null);
  const { aoVivo } = useSuporteAoVivo(id);

  const { data: t } = useQuery({
    queryKey: ["ticket", id],
    enabled: !!me,
    refetchInterval: intervaloDeRecarga(aoVivo),
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(
          "*, clients(nome), support_inboxes(nome), ticket_categorias(nome)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: mensagens } = useQuery({
    queryKey: ["ticket-mensagens", id],
    enabled: !!me,
    // A conversa é o que mais dói ficar velho: o cliente responde e o atendente
    // segue escrevendo sem saber.
    refetchInterval: intervaloDeRecarga(aoVivo),
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_messages")
        .select("id, tipo, canal, corpo, autor_id, autor_nome, autor_email, created_at")
        .eq("ticket_id", id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Mensagem[];
    },
  });

  const { data: copias } = useQuery({
    queryKey: ["ticket-copias", id],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("ticket_watchers").select("id, email").eq("ticket_id", id);
      return data ?? [];
    },
  });

  const { data: agentes } = useAgentes(!!me?.isSuporte);

  // A situação escolhida no botão de envio. Recalculada quando o chamado muda
  // de estado por fora (resposta do cliente, colega mexendo ao mesmo tempo).
  const statusAtual = (t?.status as string | undefined) ?? null;
  const envio: StatusDeEnvioId = statusEnvio ?? (statusAtual ? envioSugerido(statusAtual) : "em_atendimento");

  const responder = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ticket_messages").insert({
        ticket_id: id,
        tipo: interna ? "nota_interna" : "publica",
        canal: "portal",
        corpo: texto.trim(),
        autor_id: me!.userId,
        autor_nome: me!.fullName,
        autor_email: me!.email,
      });
      if (error) throw error;

      // O status vai junto com a resposta, e depois dela: o gatilho da mensagem
      // move o chamado para "Aberto" ao registrar a primeira resposta, então
      // gravar antes seria desfeito na hora.
      if (me!.isSuporte && !interna && envio !== statusAtual) {
        const { error: erroStatus } = await supabase.from("tickets").update({ status: envio }).eq("id", id);
        if (erroStatus) throw erroStatus;
      }

      // Entrega imediata: sem isso a mensagem so sairia no proximo disparo.
      if (!interna) await despacharEmails({ data: { ticketId: id } }).catch(() => undefined);
    },
    onSuccess: () => {
      setTexto("");
      setStatusEnvio(null);
      qc.invalidateQueries({ queryKey: ["ticket-mensagens", id] });
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      toast.success(interna ? "Nota interna registrada." : "Resposta enviada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const atribuir = useMutation({
    mutationFn: async (responsavel: string | null) => {
      const { error } = await supabase.from("tickets").update({ responsavel_id: responsavel }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, responsavel) => {
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["ticket-mensagens", id] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      toast.success(
        responsavel === null
          ? "Chamado devolvido à caixa geral."
          : responsavel === me?.userId
            ? "Chamado assumido."
            : "Responsável atualizado.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const atualizar = useMutation({
    mutationFn: async (campos: { status?: TicketStatusId; prioridade?: PrioridadeId }) => {
      const { error } = await supabase.from("tickets").update(campos).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addCopia = useMutation({
    mutationFn: async () => {
      const { validos, invalidos } = lerEmails(novaCopia);
      if (invalidos.length) throw new Error(`E-mail inválido: ${invalidos.join(", ")}`);
      if (!validos.length) throw new Error("Informe ao menos um e-mail.");
      const { error } = await supabase
        .from("ticket_watchers")
        .insert(validos.map((e) => ({ ticket_id: id, email: e })));
      if (error) throw error;
    },
    onSuccess: () => {
      setNovaCopia("");
      qc.invalidateQueries({ queryKey: ["ticket-copias", id] });
      toast.success("Adicionado em cópia.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <AppShell>Carregando…</AppShell>;
  if (!me?.isSuporte && !me?.clientId)
    return (
      <AppShell>
        <NoAccess />
      </AppShell>
    );
  if (!t)
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Chamado não encontrado ou sem acesso.</p>
      </AppShell>
    );

  const encerrado = ENCERRADOS.includes(t.status as string);
  const respondido = !!t.primeira_resposta_em;

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/tickets" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar para os chamados
        </Link>
        {me.isSuporte && <AoVivo ativo={aoVivo} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        {/* Conversa */}
        <div className="min-w-0">
          <div className="panel mb-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">#{t.numero as number}</span>
              <StatusTag status={t.status as string} />
              <PrioridadeTag prioridade={t.prioridade as string} />
            </div>
            <h1 className="mt-2 font-display text-xl font-semibold">{t.assunto as string}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {(t.clients as { nome?: string } | null)?.nome} · aberto por{" "}
              {(t.solicitante_nome as string) || (t.solicitante_email as string)} · {dt(t.aberto_em as string)}
              {me.isSuporte && (
                <>
                  {" · "}
                  {nomeDoAgente(agentes, t.responsavel_id as string | null) ? (
                    <span className="text-foreground">
                      com {nomeDoAgente(agentes, t.responsavel_id as string | null)}
                    </span>
                  ) : (
                    <span className="text-amber-300">na caixa geral</span>
                  )}
                </>
              )}
            </p>

            {!encerrado && (
              <div className="mt-3 flex flex-wrap gap-4 border-t border-border pt-3">
                {!respondido && (
                  <SlaTag
                    rotulo="1ª resposta"
                    prazo={t.prazo_primeira_resposta as string}
                    pausado={!!t.pausado_desde}
                  />
                )}
                <SlaTag
                  rotulo="resolução"
                  prazo={t.prazo_resolucao as string}
                  cumpridoEm={t.resolvido_em as string}
                  pausado={!!t.pausado_desde}
                />
                {!!t.pausado_desde && (
                  <span className="text-[11px] text-muted-foreground">
                    relógio pausado desde {quandoRelativo(t.pausado_desde as string)}
                  </span>
                )}
              </div>
            )}
          </div>

          <ul className="mb-4 flex flex-col gap-3">
            {(mensagens ?? []).map((m) =>
              // Registro do sistema (troca de responsável, por exemplo) é linha
              // de histórico, não conversa: entra discreto para não competir com
              // o que o cliente escreveu.
              m.tipo === "sistema" ? (
                <li key={m.id} className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  <span>{m.corpo}</span>
                  <span className="opacity-60">{quandoRelativo(m.created_at)}</span>
                </li>
              ) : (
              <li
                key={m.id}
                className={cn(
                  "panel p-4",
                  m.tipo === "nota_interna" && "border-amber-500/30 bg-amber-500/5",
                )}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                    {iniciaisDe(m.autor_nome ?? m.autor_email)}
                  </span>
                  <span className="text-sm font-medium">{m.autor_nome ?? m.autor_email ?? "Sistema"}</span>
                  <span className="text-xs text-muted-foreground">{quandoRelativo(m.created_at)}</span>
                  {m.canal === "email" && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Mail className="h-3 w-3" /> por e-mail
                    </span>
                  )}
                  {m.tipo === "nota_interna" && (
                    <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 px-1.5 py-0.5 text-[11px] text-amber-300">
                      <Lock className="h-3 w-3" /> nota interna
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.corpo}</p>
              </li>
              ),
            )}
          </ul>

          {/* Resposta */}
          <div className="panel p-4">
            {me.isSuporte && (
              <div className="mb-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setInterna(false)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    !interna ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  Responder ao cliente
                </button>
                <button
                  type="button"
                  onClick={() => setInterna(true)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                    interna ? "bg-amber-500/20 text-amber-200" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Lock className="h-3.5 w-3.5" /> Nota interna
                </button>
              </div>
            )}

            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={4}
              placeholder={
                interna
                  ? "Anotação visível apenas para a equipe…"
                  : "Escreva a resposta. Ela vai por e-mail para o solicitante e para quem está em cópia."
              }
              className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {interna
                  ? "O cliente não verá esta anotação."
                  : "O solicitante e as cópias recebem por e-mail."}
              </p>

              {me.isSuporte && !interna ? (
                <EnviarComStatus
                  valor={envio}
                  aoMudar={setStatusEnvio}
                  aoEnviar={() => responder.mutate()}
                  desabilitado={!texto.trim()}
                  enviando={responder.isPending}
                />
              ) : (
                <Button size="sm" disabled={!texto.trim() || responder.isPending} onClick={() => responder.mutate()}>
                  <Send className="mr-2 h-4 w-4" />
                  {interna ? "Registrar nota" : "Enviar resposta"}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Painel lateral */}
        <aside className="flex flex-col gap-4">
          {me.isSuporte && (
            <div className="panel p-4">
              <h2 className="mb-3 text-sm font-semibold">Atendimento</h2>

              <label className="mb-1 block text-xs text-muted-foreground">Responsável</label>
              <div className="mb-3">
                <SeletorResponsavel
                  valor={t.responsavel_id as string | null}
                  agentes={agentes}
                  euId={me.userId}
                  ocupado={atribuir.isPending}
                  aoMudar={(v) => atribuir.mutate(v)}
                />
              </div>

              <label className="mb-1 block text-xs text-muted-foreground">Situação</label>
              <select
                value={t.status as string}
                onChange={(e) => atualizar.mutate({ status: e.target.value as TicketStatusId })}
                className="mb-3 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {TICKET_STATUS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>

              <label className="mb-1 block text-xs text-muted-foreground">Criticidade</label>
              <select
                value={t.prioridade as string}
                onChange={(e) => atualizar.mutate({ prioridade: e.target.value as PrioridadeId })}
                className="mb-3 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {PRIORIDADES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>

              <p className="text-xs text-muted-foreground">
                Caixa: {(t.support_inboxes as { nome?: string } | null)?.nome ?? "—"}
                <br />
                Categoria: {(t.ticket_categorias as { nome?: string } | null)?.nome ?? "—"}
                {(t.reaberturas as number) > 0 && (
                  <>
                    <br />
                    Reaberto {t.reaberturas as number}x
                  </>
                )}
              </p>
            </div>
          )}

          {!me.isSuporte && !encerrado && (
            <div className="panel p-4">
              <h2 className="mb-2 text-sm font-semibold">Resolvido?</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Se o problema foi resolvido, você pode encerrar o chamado. Ele reabre automaticamente se você responder
                de novo.
              </p>
              <Button variant="outline" size="sm" className="w-full" onClick={() => atualizar.mutate({ status: "fechado" })}>
                Encerrar chamado
              </Button>
            </div>
          )}

          <div className="panel p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4" /> Acompanhando
            </h2>
            <ul className="mb-3 flex flex-col gap-1 text-xs">
              <li className="text-muted-foreground">
                {t.solicitante_email as string} <span className="opacity-60">(solicitante)</span>
              </li>
              {(copias ?? []).map((c) => (
                <li key={c.id as string} className="text-muted-foreground">
                  {c.email as string}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                value={novaCopia}
                onChange={(e) => setNovaCopia(e.target.value)}
                placeholder="e-mail em cópia"
                className="h-8 text-xs"
              />
              <Button size="sm" variant="outline" disabled={addCopia.isPending} onClick={() => addCopia.mutate()}>
                <UserPlus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
