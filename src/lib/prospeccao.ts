/**
 * Vocabulário e leitura do score de prospecção.
 *
 * O score existe para responder uma pergunta só: por quem começar. São 8.297
 * empresas e uma pessoa — atacar em ordem alfabética joga fora a única vantagem
 * que essa base tem sobre uma lista comprada, que é o histórico de chamados de
 * Fluig de cada uma.
 */

export const FATORES = [
  {
    id: "momento",
    label: "Entrou agora em Fluig",
    maximo: 25,
    ajuda: "Há quantos meses a empresa apareceu em Fluig. É o sinal mais forte da base, e o único que expira.",
    cor: "bg-primary",
  },
  {
    id: "uso",
    label: "Uso do Fluig",
    maximo: 20,
    ajuda: "Quantos chamados já abriu. Muito chamado é ambiente complexo sem quem resolva por dentro.",
    cor: "bg-sky-400",
  },
  {
    id: "recencia",
    label: "Ainda está viva",
    maximo: 15,
    ajuda: "Há quanto tempo foi o último chamado. Quem parou há três anos provavelmente largou o produto.",
    cor: "bg-emerald-400",
  },
  {
    id: "sem_parceiro",
    label: "Sem consultoria",
    maximo: 10,
    ajuda: "Não há consultoria atuando. É a diferença entre uma conversa e uma disputa com o incumbente.",
    cor: "bg-fuchsia-400",
  },
  {
    id: "dor",
    label: "Dor agora",
    maximo: 10,
    ajuda: "Chamados abertos neste momento. É gancho de conversa que e-mail frio não tem.",
    cor: "bg-rose-400",
  },
  {
    id: "porte",
    label: "Porte",
    maximo: 10,
    ajuda: "Large e Select pagam contrato maior. Setor público compra, mas por licitação.",
    cor: "bg-violet-400",
  },
  {
    id: "alcance",
    label: "Dá para falar",
    maximo: 10,
    ajuda: "Telefone, e-mail e decisor mapeado. Score alto sem contato não vira reunião.",
    cor: "bg-amber-400",
  },
] as const;

export type FatorId = (typeof FATORES)[number]["id"];

export const SITUACOES_ALVO = [
  { id: "a_contatar", label: "A contatar", cor: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  { id: "tentando", label: "Tentando", cor: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { id: "respondeu", label: "Respondeu", cor: "bg-primary/15 text-primary border-primary/30" },
  { id: "reuniao_marcada", label: "Reunião marcada", cor: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  { id: "virou_oportunidade", label: "Virou oportunidade", cor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { id: "descartado", label: "Descartado", cor: "bg-muted text-muted-foreground border-border" },
] as const;

export type SituacaoAlvoId = (typeof SITUACOES_ALVO)[number]["id"];

/** Situações em que o alvo ainda está na mesa. */
export const EM_ANDAMENTO: readonly string[] = [
  "a_contatar",
  "tentando",
  "respondeu",
  "reuniao_marcada",
];

export const CANAIS = ["Telefone", "E-mail", "WhatsApp", "LinkedIn", "Indicação"] as const;

export const MOTIVOS_DESCARTE = [
  "Já tem parceiro",
  "Sem orçamento",
  "Não usa mais o Fluig",
  "Sem interesse",
  "Não consegui contato",
  "Contato errado",
  "Outro",
] as const;

export const rotuloSituacaoAlvo = (id: string) =>
  SITUACOES_ALVO.find((s) => s.id === id)?.label ?? id;
export const corSituacaoAlvo = (id: string) => SITUACOES_ALVO.find((s) => s.id === id)?.cor ?? "";

/** Faixa do score, para colorir e para agrupar a fila. */
export function faixaDoScore(score: number): { label: string; cor: string; texto: string } {
  if (score >= 70) return { label: "Quente", cor: "bg-emerald-500", texto: "text-emerald-400" };
  if (score >= 50) return { label: "Boa", cor: "bg-primary", texto: "text-primary" };
  if (score >= 30) return { label: "Morna", cor: "bg-amber-500", texto: "text-amber-400" };
  return { label: "Fria", cor: "bg-muted-foreground", texto: "text-muted-foreground" };
}

type Linha = {
  p_momento?: number | null;
  p_sem_parceiro?: number | null;
  p_uso: number;
  p_recencia: number;
  p_dor: number;
  p_porte: number;
  p_alcance: number;
};

export function componentes(l: Linha): { id: FatorId; valor: number; maximo: number }[] {
  return [
    { id: "momento", valor: Number(l.p_momento ?? 0), maximo: 25 },
    { id: "uso", valor: Number(l.p_uso), maximo: 20 },
    { id: "recencia", valor: Number(l.p_recencia), maximo: 15 },
    { id: "sem_parceiro", valor: Number(l.p_sem_parceiro ?? 0), maximo: 10 },
    { id: "dor", valor: Number(l.p_dor), maximo: 10 },
    { id: "porte", valor: Number(l.p_porte), maximo: 10 },
    { id: "alcance", valor: Number(l.p_alcance), maximo: 10 },
  ];
}

/**
 * Uma frase dizendo por que esta empresa está nesta posição.
 *
 * O número sozinho não convence ninguém a pegar o telefone. O que convence é
 * "297 chamados, dois abertos agora, último na semana passada".
 */
export const CLASSES_ENTRADA = [
  {
    id: "recente",
    label: "Cliente novo",
    ajuda: "Chegou agora na TOTVS e já em Fluig. Nenhum parceiro estabelecido.",
    cor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  {
    id: "cross_sell",
    label: "Comprou Fluig agora",
    ajuda: "Já era TOTVS em outro produto e acabou de entrar em Fluig.",
    cor: "bg-primary/15 text-primary border-primary/30",
  },
  {
    id: "novo_totvs",
    label: "Novo na TOTVS",
    ajuda: "Entrou na TOTVS agora, com Fluig no pacote.",
    cor: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  },
] as const;

export const rotuloClasseEntrada = (id?: string | null) =>
  CLASSES_ENTRADA.find((c) => c.id === id)?.label ?? "—";
export const corClasseEntrada = (id?: string | null) =>
  CLASSES_ENTRADA.find((c) => c.id === id)?.cor ?? "";

/** Meses desde a entrada em Fluig, para a tela dizer "há 2 meses". */
export function mesesDesde(iso?: string | null): number | null {
  if (!iso) return null;
  const dt = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const hoje = new Date();
  return (hoje.getFullYear() - dt.getFullYear()) * 12 + (hoje.getMonth() - dt.getMonth());
}

export function porQue(l: {
  fluig_entrada_em?: string | null;
  fluig_tem_consultoria?: boolean | null;
  tickets_fluig?: number | null;
  tickets_abertos?: number | null;
  ultimo_ticket?: string | null;
  telefones?: number | null;
  classificacao?: string | null;
}): string[] {
  const razoes: string[] = [];

  // A entrada recente vem primeiro porque é o que decide a abordagem.
  const meses = mesesDesde(l.fluig_entrada_em);
  if (meses !== null) {
    razoes.push(
      meses <= 0 ? "entrou em Fluig este mês" : `entrou em Fluig há ${meses} ${meses === 1 ? "mês" : "meses"}`,
    );
    if (!l.fluig_tem_consultoria) razoes.push("sem consultoria");
  }

  const tk = l.tickets_fluig ?? 0;
  if (tk >= 100) razoes.push(`${tk} chamados de Fluig — ambiente pesado`);
  else if (tk >= 20) razoes.push(`${tk} chamados de Fluig`);

  if ((l.tickets_abertos ?? 0) > 0) {
    razoes.push(`${l.tickets_abertos} chamado(s) aberto(s) agora`);
  }

  if (l.ultimo_ticket) {
    const dias = Math.round((Date.now() - new Date(l.ultimo_ticket).getTime()) / 86_400_000);
    if (dias <= 30) razoes.push("mexeu no Fluig este mês");
    else if (dias <= 90) razoes.push(`último chamado há ${Math.round(dias / 30)} meses`);
    else if (dias > 730) razoes.push(`parado há ${Math.round(dias / 365)} anos`);
  }

  if (l.classificacao === "Large" || l.classificacao === "Select") {
    razoes.push(`conta ${l.classificacao}`);
  }
  if (!l.telefones) razoes.push("sem telefone na base");

  return razoes;
}

export function quandoDia(iso?: string | null): string {
  if (!iso) return "—";
  const dias = Math.round((new Date(`${iso.slice(0, 10)}T00:00:00`).getTime() - Date.now()) / 86_400_000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  if (dias === -1) return "ontem";
  if (dias < 0) return `atrasado ${Math.abs(dias)} dias`;
  return `em ${dias} dias`;
}
