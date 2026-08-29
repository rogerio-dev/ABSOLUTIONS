/** Vocabulário e cálculos do módulo financeiro. */

export const MODALIDADES_PAGAMENTO = [
  {
    id: "por_task",
    label: "Por card concluído",
    ajuda: "Recebe as horas orçadas nos cards que concluiu. É a modalidade padrão.",
    cor: "bg-primary/15 text-primary border-primary/30",
  },
  {
    id: "fixo_mensal",
    label: "Fixo mensal",
    ajuda: "Valor fechado por mês, independente do volume de cards.",
    cor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  {
    id: "por_hora",
    label: "Por hora apontada",
    ajuda: "Hora lançada e aprovada. Use só em caso excepcional — é o modelo que costuma inflar.",
    cor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  {
    id: "sem_custo",
    label: "Sem custo",
    ajuda: "Sócio ou você mesmo. Aparece na conta de horas, não gera título a pagar.",
    cor: "bg-muted text-muted-foreground border-border",
  },
] as const;

export type ModalidadePagamentoId = (typeof MODALIDADES_PAGAMENTO)[number]["id"];

export const SITUACOES_TITULO = [
  { id: "previsto", label: "Previsto", cor: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  { id: "emitido", label: "Emitido", cor: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { id: "pago", label: "Pago", cor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { id: "cancelado", label: "Cancelado", cor: "bg-muted text-muted-foreground border-border" },
] as const;

export type SituacaoTituloId = (typeof SITUACOES_TITULO)[number]["id"];

export const TIPOS_PAGAMENTO = [
  { id: "colaborador", label: "Execução" },
  { id: "fornecedor", label: "Fornecedor" },
  { id: "imposto", label: "Imposto" },
  { id: "despesa", label: "Despesa" },
] as const;

export const TIPOS_CONTA = [
  { id: "corrente", label: "Conta corrente" },
  { id: "poupanca", label: "Poupança" },
  { id: "caixa", label: "Caixa" },
  { id: "aplicacao", label: "Aplicação" },
] as const;

export const TIPOS_DOC_FINANCEIRO = [
  { id: "nf_emitida", label: "NF que emitimos" },
  { id: "nf_recebida", label: "NF que recebemos" },
  { id: "boleto", label: "Boleto" },
  { id: "comprovante", label: "Comprovante de pagamento" },
  { id: "contrato", label: "Contrato" },
  { id: "outro", label: "Outro" },
] as const;

export const CATEGORIAS_DESPESA = [
  "Execução",
  "Infraestrutura",
  "Ferramentas e licenças",
  "Contabilidade",
  "Impostos",
  "Marketing",
  "Comissão",
  "Outros",
] as const;

export const rotuloModalidadePgto = (id: string) =>
  MODALIDADES_PAGAMENTO.find((m) => m.id === id)?.label ?? id;
export const corModalidadePgto = (id: string) =>
  MODALIDADES_PAGAMENTO.find((m) => m.id === id)?.cor ?? "";
export const rotuloSituacaoTitulo = (id: string) =>
  SITUACOES_TITULO.find((s) => s.id === id)?.label ?? id;
export const corSituacaoTitulo = (id: string) => SITUACOES_TITULO.find((s) => s.id === id)?.cor ?? "";
export const rotuloTipoPagamento = (id: string) =>
  TIPOS_PAGAMENTO.find((t) => t.id === id)?.label ?? id;
export const rotuloDocFinanceiro = (id: string) =>
  TIPOS_DOC_FINANCEIRO.find((t) => t.id === id)?.label ?? id;

/** Aberto é o que ainda vai mexer no caixa. */
export const ABERTOS: readonly string[] = ["previsto", "emitido"];

export const dinheiro = (v?: number | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

export const dinheiroCurto = (v?: number | null) => {
  const n = Number(v ?? 0);
  if (Math.abs(n) >= 1000)
    return `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return dinheiro(n);
};

export const horas = (v?: number | null) =>
  `${Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;

export const competencia = (iso?: string | null) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR", {
        month: "short",
        year: "numeric",
      })
    : "—";

/**
 * Um título vencido e não pago não muda de situação sozinho no banco — mudar
 * dado por passagem de tempo obrigaria alguém a rodar rotina todo dia. O atraso
 * é derivado na leitura, que é sempre verdade no momento em que se olha.
 */
export function atrasado(t: { vencimento?: string | null; situacao?: string | null }): boolean {
  if (!t.vencimento || !t.situacao || !ABERTOS.includes(t.situacao)) return false;
  return new Date(`${t.vencimento}T23:59:59`) < new Date();
}

export function diasDeAtraso(vencimento?: string | null): number {
  if (!vencimento) return 0;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((hoje.getTime() - new Date(`${vencimento}T00:00:00`).getTime()) / 86_400_000);
}

export function primeiroDiaDoMes(d = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function tamanhoLegivel(bytes?: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function nomeSeguro(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}
