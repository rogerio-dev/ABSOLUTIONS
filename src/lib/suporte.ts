/** Constantes e cálculos de apresentação do módulo de suporte. */

export const TICKET_STATUS = [
  { id: "novo", label: "Novo", cor: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  { id: "em_atendimento", label: "Em atendimento", cor: "bg-primary/15 text-primary border-primary/30" },
  { id: "aguardando_cliente", label: "Aguardando cliente", cor: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { id: "resolvido", label: "Resolvido", cor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { id: "fechado", label: "Fechado", cor: "bg-muted text-muted-foreground border-border" },
] as const;

export type TicketStatusId = (typeof TICKET_STATUS)[number]["id"];

export const PRIORIDADES = [
  { id: "critica", label: "Crítica", ajuda: "Operação parada, sem alternativa.", cor: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  { id: "alta", label: "Alta", ajuda: "Impacto grande, mas há contorno.", cor: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  { id: "media", label: "Média", ajuda: "Atrapalha, sem parar o trabalho.", cor: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { id: "baixa", label: "Baixa", ajuda: "Dúvida ou melhoria sem urgência.", cor: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
] as const;

export type PrioridadeId = (typeof PRIORIDADES)[number]["id"];

export const rotuloStatus = (id: string) => TICKET_STATUS.find((s) => s.id === id)?.label ?? id;
export const corStatus = (id: string) => TICKET_STATUS.find((s) => s.id === id)?.cor ?? "";
export const rotuloPrioridade = (id: string) => PRIORIDADES.find((p) => p.id === id)?.label ?? id;
export const corPrioridade = (id: string) => PRIORIDADES.find((p) => p.id === id)?.cor ?? "";

/** Status em que o relógio do SLA não corre mais. */
export const ENCERRADOS: readonly string[] = ["resolvido", "fechado"];

export type EstadoSla = {
  situacao: "cumprido" | "estourado" | "em_risco" | "no_prazo" | "sem_prazo";
  rotulo: string;
  cor: string;
  restanteMin: number | null;
};

function humanizar(min: number): string {
  const abs = Math.abs(min);
  if (abs < 60) return `${abs} min`;
  if (abs < 1440) return `${Math.floor(abs / 60)}h${abs % 60 ? ` ${abs % 60}min` : ""}`;
  return `${Math.floor(abs / 1440)}d ${Math.floor((abs % 1440) / 60)}h`;
}

/**
 * Traduz um prazo em algo que o atendente entenda de relance.
 * `cumpridoEm` é o momento em que a meta foi batida (primeira resposta ou
 * resolução); quando presente, o relógio para e só importa se bateu no prazo.
 */
export function avaliarSla(prazo?: string | null, cumpridoEm?: string | null): EstadoSla {
  if (!prazo) {
    return { situacao: "sem_prazo", rotulo: "sem SLA", cor: "text-muted-foreground", restanteMin: null };
  }

  const limite = new Date(prazo).getTime();

  if (cumpridoEm) {
    const dentro = new Date(cumpridoEm).getTime() <= limite;
    return dentro
      ? { situacao: "cumprido", rotulo: "no prazo", cor: "text-emerald-400", restanteMin: null }
      : { situacao: "estourado", rotulo: "fora do prazo", cor: "text-rose-400", restanteMin: null };
  }

  const restanteMin = Math.round((limite - Date.now()) / 60000);

  if (restanteMin < 0) {
    return { situacao: "estourado", rotulo: `estourou há ${humanizar(restanteMin)}`, cor: "text-rose-400", restanteMin };
  }
  if (restanteMin <= 60) {
    return { situacao: "em_risco", rotulo: `vence em ${humanizar(restanteMin)}`, cor: "text-amber-400", restanteMin };
  }
  return { situacao: "no_prazo", rotulo: `${humanizar(restanteMin)} restantes`, cor: "text-muted-foreground", restanteMin };
}

/** Ordena a fila por urgência: quem está mais perto de estourar aparece primeiro. */
export function urgencia(t: { status: string; prazo_primeira_resposta?: string | null; primeira_resposta_em?: string | null; prazo_resolucao?: string | null; resolvido_em?: string | null }): number {
  if (ENCERRADOS.includes(t.status)) return Number.MAX_SAFE_INTEGER;
  const alvo = t.primeira_resposta_em ? t.prazo_resolucao : t.prazo_primeira_resposta;
  if (!alvo) return Number.MAX_SAFE_INTEGER - 1;
  return new Date(alvo).getTime();
}

/** Valida e normaliza uma lista de e-mails separada por vírgula, ponto e vírgula ou quebra de linha. */
export function lerEmails(bruto: string): { validos: string[]; invalidos: string[] } {
  const partes = bruto.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean);
  const validos: string[] = [];
  const invalidos: string[] = [];
  const padrao = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  for (const p of partes) {
    const e = p.toLowerCase();
    if (padrao.test(e)) {
      if (!validos.includes(e)) validos.push(e);
    } else {
      invalidos.push(p);
    }
  }
  return { validos, invalidos };
}
