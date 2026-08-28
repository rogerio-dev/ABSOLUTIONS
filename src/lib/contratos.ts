/** Vocabulário e cálculos de apresentação do módulo de contratos. */

export const MODALIDADES = [
  {
    id: "banco_horas",
    label: "Banco de horas",
    curto: "Banco de horas",
    ajuda: "Pacote de horas por mês, com saldo acompanhado.",
    cor: "bg-primary/15 text-primary border-primary/30",
    mede: "horas",
  },
  {
    id: "fixo_mensal",
    label: "Fixo mensal",
    curto: "Fixo mensal",
    ajuda: "Valor fixo por mês para sustentação e suporte, sem contar horas.",
    cor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    mede: "disponibilidade",
  },
  {
    id: "projeto",
    label: "Projeto",
    curto: "Projeto",
    ajuda: "Escopo e preço fechados, com início e fim.",
    cor: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    mede: "entrega",
  },
  {
    id: "horas_avulsas",
    label: "Horas avulsas",
    curto: "Avulso",
    ajuda: "Sob demanda. Fatura o que foi usado, sem pacote.",
    cor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    mede: "horas",
  },
  {
    id: "alocacao",
    label: "Alocação",
    curto: "Alocação",
    ajuda: "Profissional dedicado por período.",
    cor: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    mede: "disponibilidade",
  },
] as const;

export type ModalidadeId = (typeof MODALIDADES)[number]["id"];

export const SITUACOES = [
  { id: "rascunho", label: "Rascunho", cor: "bg-muted text-muted-foreground border-border" },
  { id: "em_negociacao", label: "Em negociação", cor: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { id: "ativo", label: "Ativo", cor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { id: "suspenso", label: "Suspenso", cor: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  { id: "encerrado", label: "Encerrado", cor: "bg-muted text-muted-foreground border-border" },
  { id: "cancelado", label: "Cancelado", cor: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
] as const;

export type SituacaoId = (typeof SITUACOES)[number]["id"];

export const REAJUSTES = [
  { id: "nenhum", label: "Sem reajuste" },
  { id: "ipca", label: "IPCA" },
  { id: "igpm", label: "IGP-M" },
  { id: "inpc", label: "INPC" },
  { id: "outro", label: "Outro" },
] as const;

export const TIPOS_DOCUMENTO = [
  { id: "contrato_assinado", label: "Contrato assinado" },
  { id: "aditivo", label: "Aditivo" },
  { id: "proposta", label: "Proposta" },
  { id: "ordem_servico", label: "Ordem de serviço" },
  { id: "nda", label: "NDA / Confidencialidade" },
  { id: "anexo_tecnico", label: "Anexo técnico" },
  { id: "outro", label: "Outro" },
] as const;

export type TipoDocumentoId = (typeof TIPOS_DOCUMENTO)[number]["id"];

export const PRODUTOS = ["Fluig", "RM", "Protheus", "Datasul", "Outro"] as const;

export const rotuloModalidade = (id: string) =>
  MODALIDADES.find((m) => m.id === id)?.label ?? id;
export const corModalidade = (id: string) => MODALIDADES.find((m) => m.id === id)?.cor ?? "";
export const rotuloSituacao = (id: string) => SITUACOES.find((s) => s.id === id)?.label ?? id;
export const corSituacao = (id: string) => SITUACOES.find((s) => s.id === id)?.cor ?? "";
export const rotuloDocumento = (id: string) =>
  TIPOS_DOCUMENTO.find((t) => t.id === id)?.label ?? id;

/** Modalidades em que contar horas faz sentido. */
export const CONTA_HORAS: readonly string[] = ["banco_horas", "horas_avulsas", "alocacao"];

export const ENCERRADOS: readonly string[] = ["encerrado", "cancelado"];

export type AlertaVigencia = {
  situacao: "sem_prazo" | "vencido" | "aviso_vencendo" | "renova_sozinho" | "no_prazo";
  rotulo: string;
  cor: string;
  /** Dias até a data limite para avisar que não vai renovar. */
  diasParaAvisar: number | null;
};

function dias(ate: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${ate}T00:00:00`).getTime() - hoje.getTime()) / 86_400_000);
}

/**
 * Traduz a vigência no que interessa decidir.
 *
 * A data que importa não é o fim do contrato: é o último dia para avisar que
 * não vai renovar. Passar dessa data, num contrato com renovação automática,
 * significa mais um ciclo inteiro — e é o tipo de prazo que se perde por não
 * estar escrito em lugar nenhum.
 */
export function avaliarVigencia(c: {
  data_fim?: string | null;
  prazo_indeterminado?: boolean | null;
  renovacao_automatica?: boolean | null;
  aviso_previo_dias?: number | null;
  situacao?: string | null;
}): AlertaVigencia {
  if (c.situacao && ENCERRADOS.includes(c.situacao)) {
    return { situacao: "sem_prazo", rotulo: "encerrado", cor: "text-muted-foreground", diasParaAvisar: null };
  }
  if (c.prazo_indeterminado || !c.data_fim) {
    return { situacao: "sem_prazo", rotulo: "prazo indeterminado", cor: "text-muted-foreground", diasParaAvisar: null };
  }

  const ateOFim = dias(c.data_fim);
  const aviso = c.aviso_previo_dias ?? 30;
  const ateOAviso = ateOFim - aviso;

  if (ateOFim < 0) {
    return {
      situacao: "vencido",
      rotulo: `vencido há ${Math.abs(ateOFim)} dia${Math.abs(ateOFim) === 1 ? "" : "s"}`,
      cor: "text-rose-400",
      diasParaAvisar: ateOAviso,
    };
  }
  if (ateOAviso < 0 && c.renovacao_automatica) {
    return {
      situacao: "renova_sozinho",
      rotulo: `renova sozinho — prazo de aviso passou`,
      cor: "text-amber-400",
      diasParaAvisar: ateOAviso,
    };
  }
  if (ateOAviso <= 30) {
    return {
      situacao: "aviso_vencendo",
      rotulo:
        ateOAviso < 0
          ? `vence em ${ateOFim} dias`
          : `${ateOAviso} dia${ateOAviso === 1 ? "" : "s"} para avisar se não renovar`,
      cor: "text-amber-400",
      diasParaAvisar: ateOAviso,
    };
  }
  return {
    situacao: "no_prazo",
    rotulo: `vence em ${ateOFim} dias`,
    cor: "text-muted-foreground",
    diasParaAvisar: ateOAviso,
  };
}

export const horas = (v?: number | null) =>
  v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;

export function tamanhoLegivel(bytes?: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Nome de arquivo seguro para caminho de storage, sem acento nem espaço. */
export function nomeSeguro(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}
