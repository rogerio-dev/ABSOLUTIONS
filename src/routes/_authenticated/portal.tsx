import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  FolderKanban,
  LifeBuoy,
  Receipt,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ContratoDoCliente } from "@/components/ContratoDoCliente";
import { useMe } from "@/lib/auth";
import { brl, d, dt } from "@/lib/crm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/portal")({
  head: () => ({
    meta: [
      { title: "Meu projeto | AB Solutions" },
      {
        name: "description",
        content: "Acompanhe projetos, entregas, chamados e faturas com a AB Solutions.",
      },
    ],
  }),
  component: Portal,
});

function Bloco({
  titulo,
  icone: Icone,
  acao,
  children,
  className,
}: {
  titulo: string;
  icone: React.ComponentType<{ className?: string }>;
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Icone className="h-4 w-4 text-primary" /> {titulo}
        </h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Portal() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState("");

  const cliente = me?.clientId ?? null;

  const { data } = useQuery({
    queryKey: ["portal", cliente],
    enabled: !!cliente,
    queryFn: async () => {
      const [projetos, contratos, reunioes, chamados, faturas, entregas] = await Promise.all([
        supabase.from("projects").select("*").eq("client_id", cliente!).order("created_at", { ascending: false }),
        supabase.from("contracts").select("*").eq("client_id", cliente!).order("data_inicio", { ascending: false }),
        supabase.from("meetings").select("*").eq("client_id", cliente!).order("inicio", { ascending: false }).limit(5),
        supabase
          .from("tickets")
          .select("id, numero, assunto, status, prioridade, aberto_em")
          .eq("client_id", cliente!)
          .order("aberto_em", { ascending: false })
          .limit(6),
        supabase
          .from("recebimentos")
          .select("id, descricao, valor, vencimento, situacao, pago_em, nf_numero, competencia")
          .order("vencimento", { ascending: false })
          .limit(12),
        supabase
          .from("entregas")
          .select("*, projects(nome)")
          .order("enviada_em", { ascending: false })
          .limit(20),
      ]);
      return {
        projetos: projetos.data ?? [],
        contratos: contratos.data ?? [],
        reunioes: reunioes.data ?? [],
        chamados: chamados.data ?? [],
        faturas: faturas.data ?? [],
        entregas: entregas.data ?? [],
      };
    },
  });

  const { data: notas } = useQuery({
    queryKey: ["portal-notas", cliente],
    enabled: !!cliente,
    queryFn: async () => {
      const { data: docs } = await supabase
        .from("financeiro_documentos")
        .select("id, nome, caminho, tipo, recebimento_id");
      const mapa: Record<string, { id: string; nome: string; caminho: string }[]> = {};
      for (const doc of docs ?? []) {
        const chave = doc.recebimento_id as string | null;
        if (!chave) continue;
        (mapa[chave] ??= []).push({
          id: doc.id as string,
          nome: doc.nome as string,
          caminho: doc.caminho as string,
        });
      }
      return mapa;
    },
  });

  const decidir = useMutation({
    mutationFn: async ({ entrega, aprovar }: { entrega: string; aprovar: boolean }) => {
      const { error } = await supabase.rpc("decidir_entrega", {
        _entrega: entrega,
        _aprovar: aprovar,
        _observacao: aprovar ? null : ajuste,
      });
      if (error) throw error;
    },
    onSuccess: (_r, v) => {
      setDecidindo(null);
      setAjuste("");
      qc.invalidateQueries({ queryKey: ["portal", cliente] });
      toast.success(v.aprovar ? "Entrega aprovada. Obrigado!" : "Pedido de ajuste registrado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** A nota é privada: o acesso sai de URL assinada de curta duração. */
  const baixarNota = async (caminho: string, nome: string) => {
    const { data: url, error } = await supabase.storage
      .from("financeiro")
      .createSignedUrl(caminho, 60, { download: nome });
    if (error || !url) {
      toast.error("Não foi possível abrir o arquivo. Fale com a nossa equipe.");
      return;
    }
    window.open(url.signedUrl, "_blank", "noopener");
  };

  const aguardando = useMemo(
    () => (data?.entregas ?? []).filter((e) => e.situacao === "aguardando"),
    [data],
  );

  if (isLoading) return <AppShell>Carregando…</AppShell>;
  if (!cliente)
    return (
      <AppShell>
        <NoAccess />
      </AppShell>
    );

  const emAberto = (data?.chamados ?? []).filter(
    (c) => !["resolvido", "fechado"].includes(c.status as string),
  );
  const aVencer = (data?.faturas ?? []).filter((f) => f.situacao === "emitido");

  return (
    <AppShell>
      <PageHeader
        title="Meu projeto"
        subtitle="Tudo o que está em andamento com a AB Solutions, em um lugar só."
      />

      {/* O que espera por você. Fica no topo porque é o único bloco que pede ação. */}
      {(aguardando.length > 0 || aVencer.length > 0) && (
        <div className="panel mb-4 border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium text-primary">Esperando você</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {aguardando.length > 0 && (
              <li className="text-muted-foreground">
                <strong className="text-foreground">{aguardando.length} entrega(s)</strong> aguardando seu
                aceite
              </li>
            )}
            {aVencer.length > 0 && (
              <li className="text-muted-foreground">
                <strong className="text-foreground">{aVencer.length} fatura(s)</strong> em aberto
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Entregas para aceite */}
        {(data?.entregas ?? []).length > 0 && (
          <Bloco titulo="Entregas" icone={ClipboardCheck} className="lg:col-span-2">
            <ul className="flex flex-col gap-2">
              {(data?.entregas ?? []).map((e) => {
                const pendente = e.situacao === "aguardando";
                return (
                  <li
                    key={e.id as string}
                    className={cn(
                      "rounded-lg border p-4",
                      pendente ? "border-primary/40 bg-primary/5" : "border-border",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {e.titulo as string}
                          {Number(e.versao) > 1 && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              versão {e.versao as number}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(e.projects as { nome?: string } | null)?.nome} · entregue{" "}
                          {dt(e.enviada_em as string)}
                        </p>
                        {e.resultado ? (
                          <p className="mt-2 whitespace-pre-wrap text-sm">{e.resultado as string}</p>
                        ) : null}
                      </div>

                      {e.situacao === "aprovado" ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          aprovado por {(e.decidida_por_nome as string) ?? "você"} em{" "}
                          {d(e.decidida_em as string)}
                        </span>
                      ) : e.situacao === "ajuste" ? (
                        <span className="shrink-0 text-xs text-amber-400">
                          ajuste pedido em {d(e.decidida_em as string)}
                        </span>
                      ) : null}
                    </div>

                    {e.observacao_cliente ? (
                      <p className="mt-2 rounded border border-border p-2 text-xs text-muted-foreground">
                        {e.observacao_cliente as string}
                      </p>
                    ) : null}

                    {pendente && (
                      <div className="mt-3 border-t border-border pt-3">
                        {decidindo === e.id ? (
                          <div className="flex flex-col gap-2">
                            <textarea
                              value={ajuste}
                              onChange={(ev) => setAjuste(ev.target.value)}
                              rows={3}
                              autoFocus
                              placeholder="O que precisa ser ajustado?"
                              className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!ajuste.trim() || decidir.isPending}
                                onClick={() =>
                                  decidir.mutate({ entrega: e.id as string, aprovar: false })
                                }
                              >
                                Enviar pedido de ajuste
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDecidindo(null)}>
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              disabled={decidir.isPending}
                              onClick={() => decidir.mutate({ entrega: e.id as string, aprovar: true })}
                            >
                              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Aprovar entrega
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setDecidindo(e.id as string)}>
                              Pedir ajuste
                            </Button>
                            <span className="text-[11px] text-muted-foreground">
                              Seu nome e a data ficam registrados no aceite.
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Bloco>
        )}

        <Bloco titulo="Projetos" icone={FolderKanban}>
          {(data?.projetos ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum projeto em andamento.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(data?.projetos ?? []).map((p) => (
                <li key={p.id as string}>
                  <Link
                    to="/projetos/$id"
                    params={{ id: p.id as string }}
                    className="flex items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-primary"
                  >
                    <span>{p.nome as string}</span>
                    <span className="text-xs text-muted-foreground">{p.status as string}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        <Bloco
          titulo="Chamados"
          icone={LifeBuoy}
          acao={
            <Link to="/tickets" className="text-xs text-primary hover:underline">
              ver todos
            </Link>
          }
        >
          {(data?.chamados ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum chamado aberto. Precisando, abra em Suporte.
            </p>
          ) : (
            <>
              {emAberto.length > 0 && (
                <p className="mb-2 text-xs text-muted-foreground">
                  {emAberto.length} em andamento
                </p>
              )}
              <ul className="divide-y divide-border">
                {(data?.chamados ?? []).map((c) => (
                  <li key={c.id as string}>
                    <Link
                      to="/tickets/$id"
                      params={{ id: c.id as string }}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:text-primary"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-mono text-xs text-muted-foreground">#{c.numero as number}</span>{" "}
                        {c.assunto as string}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{c.status as string}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Bloco>

        {/* Faturas: o que a pesquisa apontou como a lacuna mais sentida */}
        <Bloco titulo="Faturas e notas fiscais" icone={Receipt} className="lg:col-span-2">
          {(data?.faturas ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma fatura emitida até agora.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {(data?.faturas ?? []).map((f) => {
                const docs = notas?.[f.id as string] ?? [];
                const paga = f.situacao === "pago";
                return (
                  <li key={f.id as string} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{f.descricao as string}</p>
                      <p className="text-xs text-muted-foreground">
                        vence {d(f.vencimento as string)}
                        {paga && (
                          <span className="text-emerald-400"> · pago em {d(f.pago_em as string)}</span>
                        )}
                        {f.nf_numero ? ` · NF ${f.nf_numero as string}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-display text-sm font-semibold">
                      {brl(Number(f.valor))}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded border px-2 py-0.5 text-[11px]",
                        paga
                          ? "border-emerald-500/30 text-emerald-300"
                          : "border-amber-500/30 text-amber-300",
                      )}
                    >
                      {paga ? "pago" : "em aberto"}
                    </span>
                    {docs.map((doc) => (
                      <Button
                        key={doc.id}
                        size="sm"
                        variant="outline"
                        onClick={() => baixarNota(doc.caminho, doc.nome)}
                      >
                        <Download className="mr-1.5 h-3.5 w-3.5" /> NF
                      </Button>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </Bloco>

        <Bloco titulo="Contratos" icone={FileText}>
          {(data?.contratos ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum contrato disponível.</p>
          ) : (
            <div className="divide-y divide-border">
              {(data?.contratos ?? []).map((c) => (
                <ContratoDoCliente key={c.id as string} contrato={c as never} />
              ))}
            </div>
          )}
        </Bloco>

        <Bloco
          titulo="Reuniões"
          icone={CalendarDays}
          acao={
            <Link to="/agenda" className="text-xs text-primary hover:underline">
              agenda
            </Link>
          }
        >
          {(data?.reunioes ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma reunião registrada.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(data?.reunioes ?? []).map((r) => (
                <li key={r.id as string} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{r.titulo as string}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {dt(r.inicio as string)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Bloco>
      </div>
    </AppShell>
  );
}
