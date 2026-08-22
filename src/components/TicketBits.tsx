import { AlertTriangle, CheckCircle2, Clock, PauseCircle } from "lucide-react";
import { avaliarSla, corPrioridade, corStatus, rotuloPrioridade, rotuloStatus } from "@/lib/suporte";
import { cn } from "@/lib/utils";

export function Etiqueta({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium", className)}>
      {children}
    </span>
  );
}

export function StatusTag({ status }: { status: string }) {
  return <Etiqueta className={corStatus(status)}>{rotuloStatus(status)}</Etiqueta>;
}

export function PrioridadeTag({ prioridade }: { prioridade: string }) {
  return <Etiqueta className={corPrioridade(prioridade)}>{rotuloPrioridade(prioridade)}</Etiqueta>;
}

/**
 * Mostra o SLA em um golpe de vista. Antes da primeira resposta o relógio
 * relevante é o de resposta; depois dela, o de resolução.
 */
export function SlaTag({
  rotulo,
  prazo,
  cumpridoEm,
  pausado,
}: {
  rotulo: string;
  prazo?: string | null;
  cumpridoEm?: string | null;
  pausado?: boolean;
}) {
  const estado = avaliarSla(prazo, cumpridoEm);

  if (pausado && !cumpridoEm) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <PauseCircle className="h-3 w-3" />
        {rotulo}: pausado
      </span>
    );
  }

  const Icone =
    estado.situacao === "cumprido"
      ? CheckCircle2
      : estado.situacao === "estourado"
        ? AlertTriangle
        : Clock;

  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px]", estado.cor)}>
      <Icone className="h-3 w-3" />
      {rotulo}: {estado.rotulo}
    </span>
  );
}

export function quandoRelativo(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  if (min < 43200) return `há ${Math.round(min / 1440)} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function iniciaisDe(nome?: string | null) {
  const p = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  const a = p[0]?.[0] ?? "";
  const b = p.length > 1 ? (p[p.length - 1]?.[0] ?? "") : "";
  return (a + b).toUpperCase() || "?";
}
