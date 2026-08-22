/**
 * Envio de e-mail por SMTP. Roda apenas no servidor.
 *
 * Configuração esperada no ambiente (KingHost):
 *   SMTP_HOST=smtp.kinghost.net
 *   SMTP_PORT=465
 *   SMTP_USER=suporte@absolutionsconsultoria.com.br
 *   SMTP_PASS=...
 *   SMTP_FROM_NOME=Suporte AB Solutions        (opcional)
 *
 * O remetente precisa ser a mesma conta autenticada: servidores SMTP
 * costumam recusar um From diferente do usuário que fez login.
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

export function smtpConfigurado(): boolean {
  const e = process.env;
  return Boolean(e["SMTP_HOST"] && e["SMTP_USER"] && e["SMTP_PASS"]);
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

/** Envia uma mensagem. Lança se o SMTP não estiver configurado ou recusar. */
export async function enviarEmail(m: EmailParaEnviar): Promise<void> {
  if (!smtpConfigurado()) {
    throw new Error("SMTP não configurado: defina SMTP_HOST, SMTP_USER e SMTP_PASS.");
  }

  // Importado aqui dentro para não vazar dependência de servidor no pacote do navegador.
  const nodemailer = await import("nodemailer");

  const porta = Number(process.env["SMTP_PORT"] ?? 465);
  const transporte = nodemailer.createTransport({
    host: process.env["SMTP_HOST"]!,
    port: porta,
    secure: porta === 465, // 465 usa TLS direto; 587 negocia com STARTTLS
    auth: {
      user: process.env["SMTP_USER"]!,
      pass: process.env["SMTP_PASS"]!,
    },
  });

  const remetente = process.env["SMTP_USER"]!;
  const nomeRemetente = process.env["SMTP_FROM_NOME"] ?? "Suporte AB Solutions";

  await transporte.sendMail({
    from: `"${nomeRemetente}" <${remetente}>`,
    to: m.para.join(", "),
    replyTo: m.responderPara ?? remetente,
    subject: m.assunto,
    text: montarTexto(m),
    html: montarHtml(m),
  });
}
