/**
 * Webhook de entrada: transforma resposta de e-mail em mensagem do chamado.
 *
 * O provedor recebe a resposta no endereço do chamado
 * (caixa+t<numero>-<token>@dominio) e faz um POST aqui. O token no endereço é
 * quem diz a que chamado a mensagem pertence — por isso a assinatura do
 * provedor é conferida antes de qualquer coisa: sem isso, quem descobrisse um
 * endereço de resposta poderia escrever no chamado se passando por outra
 * pessoa.
 *
 * Não usa chave de serviço: fala com o banco pela chave publishable e prova
 * quem é com WEBHOOK_EMAIL_SEGREDO, conferido dentro do Postgres. Assim a
 * Railway nunca guarda uma credencial que ignora as políticas de RLS.
 *
 * Variáveis:
 *   MAILGUN_SIGNING_KEY       chave de assinatura de webhook (não é a de API)
 *   WEBHOOK_EMAIL_SEGREDO     mesmo valor gravado em app_segredos
 *   SUPABASE_URL
 *   SUPABASE_PUBLISHABLE_KEY
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const ROTA_EMAIL_ENTRADA = "/api/email/entrada";

/** Janela de tolerância do relógio. Fora dela, a assinatura é considerada velha. */
const VALIDADE_ASSINATURA_S = 15 * 60;

type Resultado = { status: number; corpo: string };

function env(nome: string): string | undefined {
  const v = process.env[nome];
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * Confere a assinatura do Mailgun: HMAC-SHA256 de timestamp+token.
 * Comparação em tempo constante para não vazar o segredo byte a byte.
 */
function assinaturaConfere(
  timestamp: string,
  token: string,
  assinatura: string,
  chave: string,
): boolean {
  const esperada = createHmac("sha256", chave).update(timestamp + token).digest("hex");
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(assinatura, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Extrai numero e token de caixa+t1000-abcdef@dominio. */
export function lerEnderecoDoChamado(
  destinatario: string,
): { numero: number; token: string } | null {
  const m = /\+t(\d+)-([a-f0-9]+)@/i.exec(destinatario);
  if (!m?.[1] || !m[2]) return null;
  return { numero: Number(m[1]), token: m[2].toLowerCase() };
}

/**
 * Remove assinaturas e o trecho citado que sobrou.
 *
 * O Mailgun já entrega `stripped-text` sem a citação, mas ele erra com clientes
 * brasileiros que escrevem "Em ... escreveu:" — então cortamos também aqui.
 */
export function limparCorpo(texto: string): string {
  const marcadores = [
    /^\s*Em\s.+escreveu:\s*$/im,
    /^\s*On\s.+wrote:\s*$/im,
    /^\s*-{2,}\s*Mensagem original\s*-{2,}\s*$/im,
    /^\s*_{5,}\s*$/m,
    /^\s*De:\s.+$/im,
    /^\s*From:\s.+$/im,
  ];

  let corte = texto.length;
  for (const re of marcadores) {
    const m = re.exec(texto);
    if (m?.index !== undefined && m.index < corte) corte = m.index;
  }

  return texto
    .slice(0, corte)
    .replace(/\r\n/g, "\n")
    .replace(/^\s*>.*$/gm, "") // linhas citadas soltas
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Autorresposta e retorno de sistema não viram mensagem do chamado. */
function ehAutomatico(campos: URLSearchParams): boolean {
  const remetente = (campos.get("sender") ?? "").toLowerCase();
  if (/^(mailer-daemon|postmaster|no-?reply|nao-?responda)@/.test(remetente)) return true;

  const cabecalhos = (campos.get("message-headers") ?? "").toLowerCase();
  if (/"auto-submitted",\s*"(?!no")/.test(cabecalhos)) return true;
  if (/"x-autoreply"|"x-autorespond"|"precedence",\s*"(bulk|auto_reply|junk)"/.test(cabecalhos)) {
    return true;
  }

  const assunto = (campos.get("subject") ?? "").toLowerCase();
  return /^(auto(matic)?[- ]?reply|out of office|ausência do escritório|resposta autom)/.test(
    assunto,
  );
}

/** Nome legível de "Fulano <fulano@x.com>". */
function nomeDoRemetente(de: string): string | undefined {
  const m = /^\s*"?([^"<]+?)"?\s*</.exec(de);
  const nome = m?.[1]?.trim();
  return nome && !nome.includes("@") ? nome : undefined;
}

async function registrar(campos: URLSearchParams): Promise<Resultado> {
  const destinatario = campos.get("recipient") ?? campos.get("to") ?? "";
  const alvo = lerEnderecoDoChamado(destinatario);
  if (!alvo) {
    // 406 diz ao Mailgun para não tentar de novo: não é falha temporária.
    console.warn(`[email-entrada] destinatário sem token de chamado: ${destinatario}`);
    return { status: 406, corpo: "destinatario sem token de chamado" };
  }

  if (ehAutomatico(campos)) {
    console.info(`[email-entrada] #${alvo.numero}: mensagem automática ignorada`);
    return { status: 200, corpo: "automatica ignorada" };
  }

  const bruto = campos.get("stripped-text") ?? campos.get("body-plain") ?? "";
  const corpo = limparCorpo(bruto);
  if (!corpo) {
    console.info(`[email-entrada] #${alvo.numero}: corpo vazio após limpeza`);
    return { status: 200, corpo: "corpo vazio" };
  }

  const de = campos.get("from") ?? "";
  const email = campos.get("sender") ?? "";

  const url = env("SUPABASE_URL");
  const chave = env("SUPABASE_PUBLISHABLE_KEY");
  const segredo = env("WEBHOOK_EMAIL_SEGREDO");
  if (!url || !chave || !segredo) {
    console.error("[email-entrada] falta SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY ou WEBHOOK_EMAIL_SEGREDO");
    // 500 faz o Mailgun repetir depois — a mensagem não se perde.
    return { status: 500, corpo: "servidor sem credencial" };
  }

  const resposta = await fetch(`${url}/rest/v1/rpc/registrar_resposta_de_webhook`, {
    method: "POST",
    headers: { apikey: chave, "Content-Type": "application/json" },
    body: JSON.stringify({
      _segredo: segredo,
      _numero: alvo.numero,
      _token: alvo.token,
      _de_email: email,
      _de_nome: nomeDoRemetente(de) ?? null,
      _corpo: corpo,
      _message_id: campos.get("Message-Id") ?? campos.get("message-id") ?? null,
    }),
  });

  if (!resposta.ok) {
    const detalhe = (await resposta.text()).slice(0, 300);
    // Token inválido é definitivo; qualquer outra coisa merece nova tentativa.
    const definitivo = detalhe.includes("chamado nao encontrado");
    console.error(`[email-entrada] #${alvo.numero} recusado (${resposta.status}): ${detalhe}`);
    return { status: definitivo ? 406 : 500, corpo: "recusado" };
  }

  const linhas = (await resposta.json()) as Array<{ situacao?: string; ticket_id?: string }>;
  const situacao = linhas?.[0]?.situacao ?? "registrada";
  const ticket = linhas?.[0]?.ticket_id;
  console.info(`[email-entrada] #${alvo.numero}: ${situacao} (de ${email})`);

  // O aviso para a equipe sai agora. Esperar alguém abrir a tela de suporte
  // derrotaria o propósito da notificação.
  if (situacao === "registrada" && ticket) {
    await avisarEquipe({ url, chave, segredo, ticket, numero: alvo.numero });
  }

  return { status: 200, corpo: situacao };
}

type Pendente = {
  id: string;
  ticket_numero: number;
  assunto: string;
  corpo: string;
  destinatarios: string[];
  responder_para: string;
  autor_nome: string | null;
  cliente: string | null;
};

async function rpc(url: string, chave: string, nome: string, corpo: unknown): Promise<unknown> {
  const r = await fetch(`${url}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: { apikey: chave, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${nome} (${r.status}): ${texto.slice(0, 200)}`);
  // Função que retorna void responde com corpo vazio, e JSON.parse não gosta.
  return texto ? JSON.parse(texto) : null;
}

/**
 * Despacha os e-mails que a resposta recebida acabou de enfileirar.
 *
 * Falha aqui não invalida o recebimento: a mensagem já está registrada no
 * chamado, e a fila continua com o que não saiu. Por isso o erro é registrado
 * e engolido, em vez de virar um 500 que faria o Mailgun reentregar tudo.
 */
async function avisarEquipe(ctx: {
  url: string;
  chave: string;
  segredo: string;
  ticket: string;
  numero: number;
}): Promise<void> {
  try {
    const { meioConfigurado, enviarEmail } = await import("@/lib/email.server");
    if (meioConfigurado() === "nenhum") return;

    const pendentes = (await rpc(ctx.url, ctx.chave, "emails_pendentes_de_webhook", {
      _segredo: ctx.segredo,
      _ticket: ctx.ticket,
    })) as Pendente[];

    for (const p of pendentes) {
      try {
        await enviarEmail({
          para: p.destinatarios,
          assunto: p.assunto,
          corpo: p.corpo,
          responderPara: p.responder_para,
          autor: p.autor_nome ?? undefined,
          cliente: p.cliente ?? undefined,
          numero: p.ticket_numero,
        });
        await rpc(ctx.url, ctx.chave, "marcar_email_de_webhook", {
          _segredo: ctx.segredo,
          _id: p.id,
          _erro: null,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await rpc(ctx.url, ctx.chave, "marcar_email_de_webhook", {
          _segredo: ctx.segredo,
          _id: p.id,
          _erro: msg,
        });
        console.error(`[email-entrada] #${ctx.numero}: aviso não saiu: ${msg}`);
      }
    }
  } catch (e) {
    console.error(`[email-entrada] #${ctx.numero}: falha ao despachar avisos:`, e);
  }
}

/**
 * Trata o POST do provedor. Devolve `undefined` quando a requisição não é
 * para esta rota, para o chamador seguir com a renderização normal.
 */
export async function tratarEmailRecebido(request: Request): Promise<Response | undefined> {
  const { pathname } = new URL(request.url);
  if (pathname !== ROTA_EMAIL_ENTRADA) return undefined;
  if (request.method !== "POST") return new Response("método não permitido", { status: 405 });

  try {
    const chave = env("MAILGUN_SIGNING_KEY");
    if (!chave) {
      console.error("[email-entrada] MAILGUN_SIGNING_KEY ausente: recusando por segurança");
      return new Response("webhook não configurado", { status: 503 });
    }

    // O Mailgun manda multipart; FormData cobre isso e urlencoded.
    const formulario = await request.formData();
    const campos = new URLSearchParams();
    for (const [nomeCampo, valor] of formulario.entries()) {
      if (typeof valor === "string") campos.append(nomeCampo, valor);
    }

    const timestamp = campos.get("timestamp") ?? "";
    const token = campos.get("token") ?? "";
    const assinatura = campos.get("signature") ?? "";

    if (!assinaturaConfere(timestamp, token, assinatura, chave)) {
      console.warn("[email-entrada] assinatura inválida; requisição descartada");
      return new Response("assinatura inválida", { status: 401 });
    }

    const idade = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(idade) || idade > VALIDADE_ASSINATURA_S) {
      console.warn(`[email-entrada] assinatura fora da janela (${Math.round(idade)}s)`);
      return new Response("assinatura expirada", { status: 401 });
    }

    const { status, corpo } = await registrar(campos);
    return new Response(corpo, {
      status,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (erro) {
    console.error("[email-entrada] falha inesperada:", erro);
    return new Response("erro interno", { status: 500 });
  }
}
