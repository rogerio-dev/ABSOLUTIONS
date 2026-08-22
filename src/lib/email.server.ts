/**
 * Envio de e-mail. Roda apenas no servidor.
 *
 * Dois caminhos, escolhidos pelo que estiver configurado:
 *
 *   1. API HTTPS (recomendado em produção)
 *        EMAIL_API_KEY=...                 chave do provedor
 *        EMAIL_API_PROVEDOR=resend         resend | mailgun
 *        EMAIL_REMETENTE=Suporte AB Solutions <suporte@absolutionsconsultoria.com.br>
 *        MAILGUN_DOMINIO=...               só para o Mailgun
 *
 *   2. SMTP (bom para desenvolvimento; a Railway bloqueia as portas de SMTP
 *      fora do plano Pro, então em produção prefira a API)
 *        SMTP_HOST=smtp.kinghost.net
 *        SMTP_PORT=465
 *        SMTP_USER=...
 *        SMTP_PASS=...
 *        SMTP_FROM_NOME=Suporte AB Solutions
 */

export type EmailParaEnviar = {
  para: string[];
  assunto: string;
  corpo: string;
  responderPara?: string | undefined;
  autor?: string | undefined;
  cliente?: string | undefined;
  numero?: number | undefined;
};

const TEMPO_LIMITE_MS = 15_000;

const SITE = "www.absolutionsconsultoria.com.br";
const TELEFONE = "(61) 92003-5859";
const FONTE = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function env(nome: string): string | undefined {
  const v = process.env[nome];
  return v && v.trim() ? v.trim() : undefined;
}

export type MeioDeEnvio = "api" | "smtp" | "nenhum";

export function meioConfigurado(): MeioDeEnvio {
  if (env("EMAIL_API_KEY")) return "api";
  if (env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS")) return "smtp";
  return "nenhum";
}

/** Mantido para compatibilidade com quem só pergunta "dá para enviar?". */
export function smtpConfigurado(): boolean {
  return meioConfigurado() !== "nenhum";
}

function remetente(): string {
  const explicito = env("EMAIL_REMETENTE");
  if (explicito) return explicito;
  const conta = env("SMTP_USER") ?? "suporte@absolutionsconsultoria.com.br";
  return `${env("SMTP_FROM_NOME") ?? "Suporte AB Solutions"} <${conta}>`;
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Identificador estável do chamado, usado em References e In-Reply-To.
 *
 * Não é o Message-ID de uma mensagem real: é uma raiz sintética que todas as
 * mensagens do mesmo chamado compartilham. Gmail, Outlook e Apple Mail agrupam
 * por essa raiz, então a conversa vira uma thread só na caixa do cliente em vez
 * de dez e-mails soltos com o mesmo assunto.
 */
function raizDaConversa(m: EmailParaEnviar): string | undefined {
  if (!m.numero) return undefined;
  // O domínio aqui é fixo de propósito. Se viesse do remetente, trocar o
  // endereço de envio ou o provedor quebraria o agrupamento de tudo que já foi
  // enviado, e a conversa do cliente se partiria em duas no meio do chamado.
  return `<chamado-${m.numero}@${SITE.replace(/^www\./, "")}>`;
}

/** Trecho que alguns clientes mostram ao lado do assunto, antes de abrir. */
function preheader(m: EmailParaEnviar): string {
  return m.corpo.replace(/\s+/g, " ").trim().slice(0, 110);
}

/**
 * Modelo em HTML pensado para cair na caixa de entrada.
 *
 * A primeira versão daqui era um cartão: fundo cinza, caixa branca com borda
 * arredondada, rótulo colorido em caixa alta, tabelas aninhadas. O Gmail leu
 * isso como peça de marketing e mandou para Promoções — e leu certo, porque era
 * exatamente a forma de uma newsletter.
 *
 * O classificador do Gmail olha estrutura, não intenção. Tabela aninhada com
 * cor de fundo, borda arredondada, botão e cabeçalho colorido somam pontos para
 * Promoções; e-mail que parece carta escrita por gente vai para Principal. Por
 * isso o modelo aqui é quase texto: sem cor de fundo, sem cartão, sem borda,
 * sem tabela, sem imagem. Só tipografia, em uma coluna.
 *
 * O resto continua conservador pelos mesmos motivos de antes: cliente de e-mail
 * corporativo é ambiente hostil. Nada de fonte externa, nada de rastreador,
 * estilo sempre inline — o Outlook renderiza com o motor do Word e descarta
 * folha de estilo no cabeçalho.
 */
function montarHtml(m: EmailParaEnviar): string {
  const paragrafos = escapar(m.corpo)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n      ");

  const identificacao = [m.numero ? `Chamado #${m.numero}` : null, m.cliente ?? null]
    .filter(Boolean)
    .map((t) => escapar(String(t)))
    .join(" &middot; ");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapar(m.assunto)}</title>
</head>
<body style="margin:0;padding:0;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapar(preheader(m))}</div>

  <div style="max-width:620px;margin:0 auto;padding:20px;font-family:${FONTE};font-size:15px;line-height:1.6;color:#222222;">

    ${identificacao ? `<p style="margin:0 0 16px;font-size:13px;color:#777777;">${identificacao}</p>` : ""}

    ${m.autor ? `<p style="margin:0 0 16px;"><strong>${escapar(m.autor)}</strong> escreveu:</p>` : ""}

    ${paragrafos || "<p style=\"margin:0 0 16px;\">&nbsp;</p>"}

    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #dddddd;font-size:13px;color:#777777;">
      Responda este e-mail para continuar no mesmo chamado.<br>
      AB Solutions &middot; Consultoria TOTVS Fluig &middot; ${TELEFONE}<br>
      ${SITE}
    </p>

  </div>
</body>
</html>`;
}

/**
 * Versão em texto puro.
 *
 * As réguas não são enfeite: quase todo cliente de e-mail cita a mensagem
 * inteira ao responder, e é por marcadores assim que a citação é reconhecida e
 * removida quando a resposta volta para o chamado.
 */
function montarTexto(m: EmailParaEnviar): string {
  const regua = "----------------------------------------";
  const linhas: (string | null)[] = [
    m.numero ? `Chamado #${m.numero}` : "Suporte AB Solutions",
    m.assunto.replace(/^\[#\d+\]\s*/, ""),
    m.cliente ?? null,
    "",
    regua,
    "",
    m.autor ? `${m.autor} escreveu:` : null,
    m.autor ? "" : null,
    m.corpo.trim(),
    "",
    regua,
    "",
    "Responda este e-mail para continuar no mesmo chamado.",
    "",
    "AB Solutions - Consultoria TOTVS Fluig",
    `${TELEFONE} - ${SITE}`,
    "",
  ];

  return linhas
    .filter((l): l is string => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

async function comLimiteDeTempo<T>(
  tarefa: (sinal: AbortSignal) => Promise<T>,
  ondeFalhou: string,
): Promise<T> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    return await tarefa(controle.signal);
  } catch (e) {
    if (controle.signal.aborted) {
      throw new Error(`${ondeFalhou}: sem resposta em ${TEMPO_LIMITE_MS / 1000}s.`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function enviarPorResend(m: EmailParaEnviar): Promise<void> {
  const raiz = raizDaConversa(m);
  await comLimiteDeTempo(async (signal) => {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${env("EMAIL_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: remetente(),
        to: m.para,
        reply_to: m.responderPara,
        subject: m.assunto,
        text: montarTexto(m),
        html: montarHtml(m),
        ...(raiz ? { headers: { References: raiz, "In-Reply-To": raiz } } : {}),
      }),
    });
    if (!r.ok) throw new Error(`Resend recusou (${r.status}): ${(await r.text()).slice(0, 200)}`);
  }, "Resend");
}

async function enviarPorMailgun(m: EmailParaEnviar): Promise<void> {
  const dominio = env("MAILGUN_DOMINIO");
  if (!dominio) throw new Error("Defina MAILGUN_DOMINIO para usar o Mailgun.");

  const form = new URLSearchParams();
  form.set("from", remetente());
  for (const p of m.para) form.append("to", p);
  if (m.responderPara) form.set("h:Reply-To", m.responderPara);
  form.set("subject", m.assunto);
  form.set("text", montarTexto(m));
  form.set("html", montarHtml(m));

  const raiz = raizDaConversa(m);
  if (raiz) {
    form.set("h:References", raiz);
    form.set("h:In-Reply-To", raiz);
  }

  // Aviso de chamado não é campanha: nada de rastrear abertura nem reescrever
  // link. Pixel de rastreio e link mascarado são exatamente o que filtro
  // corporativo procura, e aqui o ganho seria zero.
  form.set("o:tracking", "no");
  form.set("o:tracking-clicks", "no");
  form.set("o:tracking-opens", "no");

  await comLimiteDeTempo(async (signal) => {
    const r = await fetch(`https://api.mailgun.net/v3/${dominio}/messages`, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${env("EMAIL_API_KEY")}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!r.ok) throw new Error(`Mailgun recusou (${r.status}): ${(await r.text()).slice(0, 200)}`);
  }, "Mailgun");
}

async function enviarPorSmtp(m: EmailParaEnviar): Promise<void> {
  // Importado aqui dentro para não vazar dependência de servidor no pacote do navegador.
  const nodemailer = await import("nodemailer");

  const porta = Number(env("SMTP_PORT") ?? 465);
  const transporte = nodemailer.createTransport({
    host: env("SMTP_HOST")!,
    port: porta,
    secure: porta === 465, // 465 usa TLS direto; 587 negocia com STARTTLS
    auth: { user: env("SMTP_USER")!, pass: env("SMTP_PASS")! },
    // Sem estes limites a conexão fica pendurada quando a porta está bloqueada,
    // e a requisição nunca retorna — foi o que aconteceu na Railway.
    connectionTimeout: TEMPO_LIMITE_MS,
    greetingTimeout: 10_000,
    socketTimeout: TEMPO_LIMITE_MS,
  });

  const raiz = raizDaConversa(m);

  await transporte.sendMail({
    from: remetente(),
    to: m.para.join(", "),
    replyTo: m.responderPara ?? env("SMTP_USER"),
    subject: m.assunto,
    text: montarTexto(m),
    html: montarHtml(m),
    ...(raiz ? { references: raiz, inReplyTo: raiz } : {}),
  });
}

/** Envia uma mensagem pelo meio configurado. Lança se não houver nenhum. */
export async function enviarEmail(m: EmailParaEnviar): Promise<void> {
  const meio = meioConfigurado();

  if (meio === "api") {
    const provedor = (env("EMAIL_API_PROVEDOR") ?? "resend").toLowerCase();
    if (provedor === "mailgun") return enviarPorMailgun(m);
    return enviarPorResend(m);
  }

  if (meio === "smtp") return enviarPorSmtp(m);

  throw new Error(
    "Nenhum meio de envio configurado: defina EMAIL_API_KEY (recomendado) ou SMTP_HOST/USER/PASS.",
  );
}
