import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Download, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl, d } from "@/lib/crm";
import {
  CONTA_HORAS,
  corModalidade,
  horas,
  rotuloDocumento,
  rotuloModalidade,
  tamanhoLegivel,
} from "@/lib/contratos";
import { cn } from "@/lib/utils";

type Contrato = {
  id: string;
  numero: string | null;
  titulo: string;
  modalidade: string;
  situacao: string;
  escopo: string | null;
  valor: number | null;
  valor_mensal: number | null;
  horas_mensais: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  prazo_indeterminado: boolean;
  horario_atendimento: string | null;
};

/**
 * Como o cliente vê o próprio contrato.
 *
 * Fechado por padrão, porque a lista precisa caber na tela. Aberto, mostra o
 * que ele tem direito de consultar sem pedir para ninguém — inclusive o PDF
 * assinado, que é o motivo de existir esta tela.
 *
 * O download passa por URL assinada de curta duração: o arquivo é privado, e a
 * permissão é conferida no servidor a cada pedido.
 */
export function ContratoDoCliente({ contrato }: { contrato: Contrato }) {
  const [aberto, setAberto] = useState(false);
  const contaHoras = CONTA_HORAS.includes(contrato.modalidade);

  const { data: documentos } = useQuery({
    queryKey: ["contrato-docs-cliente", contrato.id],
    enabled: aberto,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_documentos")
        .select("id, nome, tipo, tamanho_bytes, caminho, created_at")
        .eq("contract_id", contrato.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: saldo } = useQuery({
    queryKey: ["contrato-saldo-cliente", contrato.id],
    enabled: aberto && contaHoras,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("saldo_de_horas", { _contrato: contrato.id });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const baixar = async (caminho: string, nome: string) => {
    const { data, error } = await supabase.storage
      .from("contratos")
      .createSignedUrl(caminho, 60, { download: nome });
    if (error || !data) {
      toast.error("Não foi possível abrir o arquivo. Fale com a equipe da AB Solutions.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <div className="py-3">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {contrato.numero ? `${contrato.numero} · ` : ""}
            {contrato.titulo}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px]",
                corModalidade(contrato.modalidade),
              )}
            >
              {rotuloModalidade(contrato.modalidade)}
            </span>
            <span>
              {d(contrato.data_inicio)} —{" "}
              {contrato.prazo_indeterminado ? "sem prazo" : d(contrato.data_fim)}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {contrato.valor_mensal ? (
            <span className="text-xs text-muted-foreground">
              {brl(Number(contrato.valor_mensal))}/mês
            </span>
          ) : null}
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground transition-transform", aberto && "rotate-180")}
          />
        </div>
      </button>

      {aberto && (
        <div className="mt-3 space-y-3 border-l-2 border-border pl-3">
          {contaHoras && saldo && (
            <div className="flex flex-wrap gap-5">
              {[
                ["Contratadas no mês", horas(Number(saldo.contratadas))],
                ["Consumidas", horas(Number(saldo.consumidas))],
                ["Saldo", horas(Number(saldo.saldo))],
              ].map(([r, v]) => (
                <div key={r}>
                  <p className="text-[11px] text-muted-foreground">{r}</p>
                  <p className="font-display text-base font-semibold">{v}</p>
                </div>
              ))}
            </div>
          )}

          {contrato.horario_atendimento && (
            <p className="text-xs text-muted-foreground">
              Atendimento: {contrato.horario_atendimento}
            </p>
          )}

          {contrato.escopo && (
            <div>
              <p className="text-[11px] text-muted-foreground">Escopo</p>
              <p className="mt-0.5 whitespace-pre-wrap text-xs">{contrato.escopo}</p>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-[11px] text-muted-foreground">Documentos</p>
            {(documentos ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum documento disponível para consulta.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {(documentos ?? []).map((doc) => (
                  <li key={doc.id as string}>
                    <button
                      type="button"
                      onClick={() => baixar(doc.caminho as string, doc.nome as string)}
                      className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-xs transition-colors hover:border-primary/50 hover:bg-accent/40"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{doc.nome as string}</span>
                        <span className="text-muted-foreground">
                          {rotuloDocumento(doc.tipo as string)} ·{" "}
                          {tamanhoLegivel(doc.tamanho_bytes as number)}
                        </span>
                      </span>
                      <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
