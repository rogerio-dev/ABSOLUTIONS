import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Inbox, LifeBuoy, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { PrioridadeTag, SlaTag, StatusTag, quandoRelativo } from "@/components/TicketBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMe } from "@/lib/auth";
import { ENCERRADOS, PRIORIDADES, TICKET_STATUS, lerEmails, urgencia } from "@/lib/suporte";

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
  solicitante_nome: string | null;
  solicitante_email: string;
  clients: { nome: string } | null;
  support_inboxes: { nome: string } | null;
  ticket_categorias: { nome: string } | null;
};

function Tickets() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("abertos");
  const [filtroCaixa, setFiltroCaixa] = useState<string>("todas");
  const [abrindo, setAbrindo] = useState(false);

  const { data: tickets, isLoading: carregando } = useQuery({
    queryKey: ["tickets"],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(
          "id, numero, assunto, status, prioridade, aberto_em, prazo_primeira_resposta, primeira_resposta_em, prazo_resolucao, resolvido_em, pausado_desde, solicitante_nome, solicitante_email, clients(nome), support_inboxes(nome), ticket_categorias(nome)",
        )
        .order("aberto_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Ticket[];
    },
  });

  const { data: caixas } = useQuery({
    queryKey: ["caixas"],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const { data } = await supabase.from("support_inboxes").select("id, nome").eq("ativa", true).order("nome");
      return data ?? [];
    },
  });

  // O cliente só consegue abrir chamado se a equipe tiver habilitado o suporte.
  const { data: habilitado } = useQuery({
    queryKey: ["suporte-habilitado", me?.clientId],
    enabled: !!me && !me.isStaff && !!me.clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("client_support")
        .select("habilitado")
        .eq("client_id", me!.clientId!)
        .maybeSingle();
      return data?.habilitado ?? false;
    },
  });

  const visiveis = useMemo(() => {
    let lista = tickets ?? [];
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
  }, [tickets, filtroStatus, filtroCaixa, busca]);

  const contagem = useMemo(() => {
    const abertos = (tickets ?? []).filter((t) => !ENCERRADOS.includes(t.status));
    const estourados = abertos.filter((t) => {
      const alvo = t.primeira_resposta_em ? t.prazo_resolucao : t.prazo_primeira_resposta;
      return alvo && new Date(alvo).getTime() < Date.now() && !t.pausado_desde;
    });
    return { abertos: abertos.length, estourados: estourados.length };
  }, [tickets]);

  if (isLoading) return <AppShell>Carregando…</AppShell>;
  if (!me?.isStaff && !me?.clientId)
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
          me.isStaff
            ? `${contagem.abertos} chamado(s) em aberto${contagem.estourados ? ` · ${contagem.estourados} fora do prazo` : ""}`
            : "Seus chamados abertos com a AB Solutions"
        }
        action={
          !me.isStaff && habilitado ? (
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

      {!me.isStaff && habilitado === false && (
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

        {me.isStaff && (caixas?.length ?? 0) > 1 && (
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

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando chamados…</p>
      ) : visiveis.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 p-10 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Nenhum chamado por aqui</p>
          <p className="text-sm text-muted-foreground">
            {me.isStaff ? "A fila está limpa." : "Quando você abrir um chamado, ele aparece nesta lista."}
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
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {me.isStaff && t.clients?.nome && <span className="font-medium text-foreground">{t.clients.nome}</span>}
                    {t.ticket_categorias?.nome && <span>{t.ticket_categorias.nome}</span>}
                    <span>{t.solicitante_nome || t.solicitante_email}</span>
                    <span>aberto {quandoRelativo(t.aberto_em)}</span>
                    {me.isStaff && t.support_inboxes?.nome && <span>caixa: {t.support_inboxes.nome}</span>}
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
