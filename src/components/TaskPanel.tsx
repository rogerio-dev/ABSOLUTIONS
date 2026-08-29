import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AtSign, Eye, EyeOff, Loader2, Send, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MentionTextarea, TextoComMencoes, extrairMencoes, type Sugestao } from "@/components/MentionTextarea";
import { useMe } from "@/lib/auth";
import { d } from "@/lib/crm";

export type TarefaResumo = {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  prioridade: string | null;
  responsavel_nome: string | null;
  responsavel_id: string | null;
  horas_estimadas: number | null;
  prazo: string | null;
  visivel_cliente: boolean;
};

type Comentario = {
  id: string;
  body: string;
  author_id: string;
  author_nome: string | null;
  created_at: string;
};

function quando(iso: string) {
  const dt = new Date(iso);
  const min = Math.round((Date.now() - dt.getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = p[0]?.[0] ?? "";
  const ultima = p.length > 1 ? (p[p.length - 1]?.[0] ?? "") : "";
  return (primeira + ultima).toUpperCase() || "?";
}

export function TaskPanel({
  tarefa,
  clientId,
  aberto,
  onFechar,
}: {
  tarefa: TarefaResumo | null;
  clientId: string | null;
  aberto: boolean;
  onFechar: () => void;
}) {
  /*
   * A lista sai do banco: é `responsavel_id` que liga o card ao financeiro.
   * Trocar aqui atualiza o nome exibido pelo gatilho, do lado do servidor.
   */
  const { data: equipe } = useQuery({
    queryKey: ["equipe-interna"],
    enabled: !!tarefa,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("equipe_interna");
      if (error) throw error;
      return data ?? [];
    },
  });

  const trocarResponsavel = useMutation({
    mutationFn: async (perfil: string | null) => {
      const { error } = await supabase
        .from("project_tasks")
        .update({ responsavel_id: perfil })
        .eq("id", tarefa!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Responsável atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: me } = useMe();
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");

  const { data: comentarios, isLoading: carregandoComentarios } = useQuery({
    queryKey: ["comentarios", tarefa?.id],
    enabled: !!tarefa?.id && aberto,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_comments")
        .select("id, body, author_id, author_nome, created_at")
        .eq("task_id", tarefa!.id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Comentario[];
    },
  });

  const { data: participantes } = useQuery({
    queryKey: ["participantes", tarefa?.id],
    enabled: !!tarefa?.id && aberto,
    queryFn: async () => {
      const { data } = await supabase.from("task_participants").select("email").eq("task_id", tarefa!.id);
      return (data ?? []).map((p) => p.email as string);
    },
  });

  // Quem pode ser mencionado: quem tem conta, mais os contatos do cliente.
  const { data: sugestoes } = useQuery({
    queryKey: ["sugestoes-mencao", clientId],
    enabled: aberto,
    queryFn: async () => {
      const [{ data: perfis }, { data: contatos }] = await Promise.all([
        supabase.from("profiles").select("email, full_name").not("email", "is", null).limit(50),
        clientId
          ? supabase.from("contacts").select("email, nome").eq("client_id", clientId).not("email", "is", null).limit(50)
          : Promise.resolve({ data: [] as { email: string; nome: string }[] }),
      ]);
      const lista: Sugestao[] = [
        ...(perfis ?? []).map((p) => ({ email: p.email as string, nome: (p.full_name as string) ?? "", origem: "plataforma" })),
        ...(contatos ?? []).map((c) => ({ email: c.email as string, nome: (c.nome as string) ?? "", origem: "contato" })),
      ];
      const vistos = new Set<string>();
      return lista.filter((s) => s.email && !vistos.has(s.email.toLowerCase()) && vistos.add(s.email.toLowerCase()));
    },
  });

  const comentar = useMutation({
    mutationFn: async (corpo: string) => {
      const { data: novo, error } = await supabase
        .from("task_comments")
        .insert({
          task_id: tarefa!.id,
          author_id: me!.userId!,
          author_nome: me!.fullName,
          body: corpo,
        })
        .select("id")
        .single();
      if (error) throw error;

      const mencoes = extrairMencoes(corpo);
      if (mencoes.length) {
        const { error: e2 } = await supabase
          .from("comment_mentions")
          .insert(mencoes.map((email) => ({ comment_id: novo.id, email })));
        if (e2) throw e2;
      }
      return mencoes.length;
    },
    onSuccess: (quantas) => {
      setTexto("");
      qc.invalidateQueries({ queryKey: ["comentarios", tarefa?.id] });
      qc.invalidateQueries({ queryKey: ["participantes", tarefa?.id] });
      toast.success(quantas ? `Comentário enviado. ${quantas} pessoa(s) mencionada(s) ganharam acesso.` : "Comentário enviado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apagar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comentarios", tarefa?.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!tarefa) return null;

  return (
    <Sheet open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle className="pr-8 text-left text-lg leading-snug">{tarefa.titulo}</SheetTitle>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="outline">{tarefa.status}</Badge>
            {tarefa.prioridade && <Badge variant="secondary">{tarefa.prioridade}</Badge>}
            {tarefa.prazo && <span className="text-xs text-muted-foreground">prazo {d(tarefa.prazo)}</span>}
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {tarefa.visivel_cliente ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {tarefa.visivel_cliente ? "visível ao cliente" : "interna"}
            </span>
          </div>
          {me?.isStaff ? (
            <div className="pt-2 text-left">
              <label className="mb-1 block text-xs text-muted-foreground">
                Responsável pela execução
              </label>
              <select
                value={tarefa.responsavel_id ?? ""}
                onChange={(e) => trocarResponsavel.mutate(e.target.value || null)}
                disabled={trocarResponsavel.isPending}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Sem responsável</option>
                {(equipe ?? []).map((p) => (
                  <option key={p.id as string} value={p.id as string}>
                    {p.nome as string} ({p.papel as string})
                  </option>
                ))}
              </select>
              {tarefa.responsavel_nome && !tarefa.responsavel_id && (
                <p className="mt-1 text-[11px] text-amber-300">
                  Hoje está como "{tarefa.responsavel_nome}", só texto. Escolha a pessoa na lista para
                  as horas deste card chegarem ao financeiro.
                </p>
              )}
              {Number(tarefa.horas_estimadas ?? 0) > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {Number(tarefa.horas_estimadas).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h
                  orçadas — é o que se paga quando o card for concluído.
                </p>
              )}
            </div>
          ) : tarefa.responsavel_nome ? (
            <p className="pt-1 text-left text-xs text-muted-foreground">Responsável: {tarefa.responsavel_nome}</p>
          ) : null}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tarefa.descricao && <p className="mb-5 text-sm text-muted-foreground">{tarefa.descricao}</p>}

          {participantes && participantes.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface/50 p-3">
              <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Com acesso a esta tarefa:</span>
              {participantes.map((e) => (
                <Badge key={e} variant="outline" className="font-normal">
                  {e}
                </Badge>
              ))}
            </div>
          )}

          <h3 className="mb-3 text-sm font-semibold">Comentários</h3>

          {carregandoComentarios ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : !comentarios?.length ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              Nenhum comentário ainda. Use <span className="font-medium text-foreground">@e-mail</span> para chamar
              alguém — quem for mencionado ganha acesso a esta tarefa.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {comentarios.map((c) => (
                <li key={c.id} className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                    {iniciais(c.author_nome ?? "?")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium">{c.author_nome ?? "Alguém"}</span>
                      <span className="text-xs text-muted-foreground">{quando(c.created_at)}</span>
                      {c.author_id === me?.userId && (
                        <button
                          type="button"
                          onClick={() => apagar.mutate(c.id)}
                          className="ml-auto text-muted-foreground transition-colors hover:text-destructive"
                          aria-label="Apagar comentário"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <TextoComMencoes texto={c.body} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-6 py-4">
          <MentionTextarea
            value={texto}
            onChange={setTexto}
            sugestoes={sugestoes ?? []}
            placeholder="Escreva um comentário. Use @ para mencionar alguém pelo e-mail…"
            disabled={comentar.isPending}
            onSubmit={() => texto.trim() && comentar.mutate(texto.trim())}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <AtSign className="h-3 w-3" /> quem for mencionado passa a ver esta tarefa
            </p>
            <Button
              size="sm"
              disabled={!texto.trim() || comentar.isPending}
              onClick={() => comentar.mutate(texto.trim())}
            >
              {comentar.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Comentar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
