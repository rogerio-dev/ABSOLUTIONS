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

/** Modelo em HTML com a identidade do site, legível também em texto puro. */
function montarHtml(m: EmailParaEnviar): string {
  const corpo = escapar(m.corpo).replace(/\n/g, "<br>");
  const titulo = m.numero ? `Chamado #${m.numero}` : "Suporte AB Solutions";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#060b18;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
    <tr><td style="padding-bottom:20px;">
      <span style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-.01em;">AB</span>
      <span style="font-size:20px;font-weight:800;color:#22d3ee;letter-spacing:-.01em;">&nbsp;Solutions</span>
      <div style="font-size:12px;color:#9db0c9;margin-top:2px;">Consultoria TOTVS Fluig</div>
    </td></tr>

    <tr><td style="background:#0e1730;border:1px solid rgba(148,183,255,.16);border-radius:14px;padding:24px;">
      <div style="font-size:13px;color:#22d3ee;font-weight:600;letter-spacing:.06em;text-transform:uppercase;">
        ${escapar(titulo)}
      </div>
      <div style="font-size:17px;color:#ffffff;font-weight:600;margin-top:6px;line-height:1.35;">
        ${escapar(m.assunto.replace(/^\[#\d+\]\s*/, ""))}
      </div>
      ${m.cliente ? `<div style="font-size:12px;color:#9db0c9;margin-top:4px;">${escapar(m.cliente)}</div>` : ""}

      <hr style="border:0;border-top:1px solid rgba(148,183,255,.16);margin:18px 0;">

      ${m.autor ? `<div style="font-size:13px;color:#9db0c9;margin-bottom:8px;"><strong style="color:#e6edf7;">${escapar(m.autor)}</strong> escreveu:</div>` : ""}
      <div style="font-size:15px;color:#e6edf7;line-height:1.65;">${corpo}</div>
    </td></tr>

    <tr><td style="padding-top:16px;font-size:12px;color:#64748b;line-height:1.6;">
      Responda este e-mail para continuar no mesmo chamado — sua resposta entra automaticamente no histórico.
      <br>AB Solutions · (61) 92003-5859 · www.absolutionsconsultoria.com.br
    </td></tr>
  </table>
</body></html>`;
}

function montarTexto(m: EmailParaEnviar): string {
  const cabecalho = m.autor ? `${m.autor} escreveu:\n\n` : "";
  return (
    `${cabecalho}${m.corpo}\n\n` +
    `---\n` +
    `Responda este e-mail para continuar no mesmo chamado.\n` +
    `AB Solutions - (61) 92003-5859 - www.absolutionsconsultoria.com.br\n`
  );
}

async function comLimiteDeTempo<T>(tarefa: (sinal: AbortSignal) => Promise<T>, ondeFalhou: string): Promise<T> {
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

  await transporte.sendMail({
    from: remetente(),
    to: m.para.join(", "),
    replyTo: m.responderPara ?? env("SMTP_USER"),
    subject: m.assunto,
    text: montarTexto(m),
    html: montarHtml(m),
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
