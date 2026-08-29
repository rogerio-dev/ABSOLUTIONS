import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Download, FileUp, Paperclip, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { d } from "@/lib/crm";
import {
  ABERTOS,
  SITUACOES_TITULO,
  TIPOS_DOC_FINANCEIRO,
  atrasado,
  corSituacaoTitulo,
  diasDeAtraso,
  dinheiro,
  nomeSeguro,
  rotuloDocFinanceiro,
  rotuloSituacaoTitulo,
  tamanhoLegivel,
} from "@/lib/financeiro";
import { cn } from "@/lib/utils";

export type Titulo = {
  id: string;
  descricao: string;
  competencia: string;
  valor: number;
  vencimento: string;
  situacao: string;
  pago_em: string | null;
  valor_pago: number | null;
  conta_id: string | null;
  nf_numero: string | null;
  categoria?: string | null;
  tipo?: string | null;
  recorrente?: boolean | null;
  clients?: { nome: string } | null;
  colaboradores?: { nome: string } | null;
};

type Conta = { id: string; nome: string };

/**
 * Linha de um título, a receber ou a pagar.
 *
 * As duas listas se comportam igual — muda o sinal e de quem é o nome — então
 * um componente só evita duas telas que divergem com o tempo.
 */
export function LinhaTitulo({
  titulo,
  tabela,
  contas,
  aoMudar,
}: {
  titulo: Titulo;
  tabela: "recebimentos" | "pagamentos";
  contas: Conta[];
  aoMudar: () => void;
}) {
  const qc = useQueryClient();
  const [abrindoAnexos, setAbrindoAnexos] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const aReceber = tabela === "recebimentos";
  const venceu = atrasado(titulo);

  const { data: docs } = useQuery({
    queryKey: ["fin-docs", titulo.id],
    enabled: abrindoAnexos,
    queryFn: async () => {
      const { data } = await supabase
        .from("financeiro_documentos")
        .select("*")
        .eq(aReceber ? "recebimento_id" : "pagamento_id", titulo.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const mudar = useMutation({
    mutationFn: async (campos: Record<string, unknown>) => {
      const { error } = await supabase.from(tabela).update(campos as never).eq("id", titulo.id);
      if (error) throw error;
    },
    onSuccess: aoMudar,
    onError: (e: Error) => toast.error(e.message),
  });

  const anexar = useMutation({
    mutationFn: async (arquivo: File) => {
      const caminho = `${tabela}/${titulo.id}/${crypto.randomUUID()}-${nomeSeguro(arquivo.name)}`;
      const { error: erroUp } = await supabase.storage
        .from("financeiro")
        .upload(caminho, arquivo, arquivo.type ? { contentType: arquivo.type } : {});
      if (erroUp) throw erroUp;

      const { error } = await supabase.from("financeiro_documentos").insert({
        [aReceber ? "recebimento_id" : "pagamento_id"]: titulo.id,
        tipo: aReceber ? "nf_emitida" : "nf_recebida",
        nome: arquivo.name,
        caminho,
        mime: arquivo.type || null,
        tamanho_bytes: arquivo.size,
      } as never);
      if (error) {
        // Sem isto, a falha aqui deixaria arquivo órfão no bucket para sempre.
        await supabase.storage.from("financeiro").remove([caminho]);
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-docs", titulo.id] });
      toast.success("Documento anexado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apagarDoc = useMutation({
    mutationFn: async ({ id, caminho }: { id: string; caminho: string }) => {
      const { error } = await supabase.from("financeiro_documentos").delete().eq("id", id);
      if (error) throw error;
      await supabase.storage.from("financeiro").remove([caminho]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fin-docs", titulo.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  /** O arquivo é privado: o acesso sai de URL assinada de curta duração. */
  const baixar = async (caminho: string, nome: string) => {
    setBaixando(true);
    const { data, error } = await supabase.storage
      .from("financeiro")
      .createSignedUrl(caminho, 60, { download: nome });
    setBaixando(false);
    if (error || !data) {
      toast.error("Não foi possível abrir o arquivo.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <li className={cn("panel p-3", venceu && "border-rose-500/30")}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{titulo.descricao}</span>
            <span
              className={cn(
                "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px]",
                corSituacaoTitulo(titulo.situacao),
              )}
            >
              {rotuloSituacaoTitulo(titulo.situacao)}
            </span>
            {venceu && (
              <span className="text-[11px] font-medium text-rose-400">
                atrasado {diasDeAtraso(titulo.vencimento)} dia(s)
              </span>
            )}
            {titulo.recorrente && (
              <span className="text-[11px] text-muted-foreground">recorrente</span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <span>{titulo.clients?.nome ?? titulo.colaboradores?.nome ?? titulo.categoria ?? "—"}</span>
            <span>vence {d(titulo.vencimento)}</span>
            {titulo.pago_em && <span className="text-emerald-400">pago {d(titulo.pago_em)}</span>}
            {titulo.nf_numero && <span>NF {titulo.nf_numero}</span>}
          </p>
        </div>

        <span
          className={cn(
            "shrink-0 font-display text-base font-semibold",
            aReceber ? "text-emerald-400" : "text-foreground",
          )}
        >
          {aReceber ? "" : "−"}
          {dinheiro(titulo.valor)}
        </span>

        <button
          type="button"
          onClick={() => setAbrindoAnexos((v) => !v)}
          title="Notas fiscais e comprovantes"
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Paperclip className="h-3.5 w-3.5" />
          {abrindoAnexos ? "fechar" : "anexos"}
        </button>

        {ABERTOS.includes(titulo.situacao) ? (
          <div className="flex items-center gap-1.5">
            <select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                mudar.mutate({
                  situacao: "pago",
                  pago_em: new Date().toISOString().slice(0, 10),
                  valor_pago: titulo.valor,
                  conta_id: e.target.value,
                });
              }}
              className="h-7 rounded-md border border-input bg-transparent px-2 text-[11px]"
            >
              <option value="">Baixar em…</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            {titulo.situacao === "previsto" && (
              <Button size="sm" variant="outline" onClick={() => mudar.mutate({ situacao: "emitido" })}>
                Emitir
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              title="Cancelar título"
              onClick={() => mudar.mutate({ situacao: "cancelado" })}
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        ) : titulo.situacao === "pago" ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
            <Check className="h-3.5 w-3.5" /> baixado
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => mudar.mutate({ situacao: "previsto" })}>
            reabrir
          </Button>
        )}
      </div>

      {abrindoAnexos && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {aReceber
                ? "A nota que emitimos para o cliente, e o comprovante do recebimento."
                : "A nota que o fornecedor emitiu para nós, o boleto e o comprovante."}
            </p>
            <input
              ref={arquivoRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.xml"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) anexar.mutate(f);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={anexar.isPending}
              onClick={() => arquivoRef.current?.click()}
            >
              <FileUp className="mr-1.5 h-3.5 w-3.5" />
              {anexar.isPending ? "Enviando…" : "Anexar"}
            </Button>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <Input
              defaultValue={titulo.nf_numero ?? ""}
              placeholder="Número da NF"
              className="h-8 w-40 text-xs"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (titulo.nf_numero ?? "")) mudar.mutate({ nf_numero: v || null });
              }}
            />
            <Input
              type="date"
              defaultValue={
                ((titulo as Record<string, unknown>)[aReceber ? "nf_emitida_em" : "nf_recebida_em"] as
                  | string
                  | null) ?? ""
              }
              className="h-8 w-40 text-xs"
              onChange={(e) =>
                mudar.mutate({
                  [aReceber ? "nf_emitida_em" : "nf_recebida_em"]: e.target.value || null,
                })
              }
            />
          </div>

          {(docs ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum documento anexado.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {(docs ?? []).map((doc) => (
                <li key={doc.id as string} className="flex items-center gap-2">
                  <select
                    value={doc.tipo as string}
                    onChange={async (e) => {
                      await supabase
                        .from("financeiro_documentos")
                        .update({ tipo: e.target.value } as never)
                        .eq("id", doc.id as string);
                      qc.invalidateQueries({ queryKey: ["fin-docs", titulo.id] });
                    }}
                    className="h-7 rounded-md border border-input bg-transparent px-2 text-[11px]"
                  >
                    {TIPOS_DOC_FINANCEIRO.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <span className="min-w-0 flex-1 truncate text-xs">{doc.nome as string}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {tamanhoLegivel(doc.tamanho_bytes as number)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={baixando}
                    onClick={() => baixar(doc.caminho as string, doc.nome as string)}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (!confirm(`Remover "${doc.nome as string}"?`)) return;
                      apagarDoc.mutate({ id: doc.id as string, caminho: doc.caminho as string });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-[11px] text-muted-foreground">
            Situação: {rotuloDocFinanceiro(aReceber ? "nf_emitida" : "nf_recebida")} é o padrão de quem
            anexa aqui — troque no seletor se for outro tipo. Todo arquivo é privado; o link de download
            vale 60 segundos.
          </p>
        </div>
      )}
    </li>
  );
}

export function FiltroSituacao({
  valor,
  aoMudar,
}: {
  valor: string;
  aoMudar: (v: string) => void;
}) {
  return (
    <select
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
    >
      <option value="abertos">Em aberto</option>
      <option value="atrasados">Atrasados</option>
      <option value="todos">Todos</option>
      {SITUACOES_TITULO.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
