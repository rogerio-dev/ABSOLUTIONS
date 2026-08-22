/**
 * Testa a conexão SMTP e envia uma mensagem de prova.
 *
 *   SMTP_HOST=smtp.kinghost.net SMTP_PORT=465 \
 *   SMTP_USER=suporte@absolutionsconsultoria.com.br SMTP_PASS=... \
 *   node scripts/testar-smtp.mjs destino@exemplo.com
 *
 * Sem argumento, envia para o próprio SMTP_USER.
 */

import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT = "465", SMTP_USER, SMTP_PASS, SMTP_FROM_NOME } = process.env;

const faltando = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"].filter((k) => !process.env[k]);
if (faltando.length) {
  console.error(`Faltam variáveis: ${faltando.join(", ")}`);
  process.exit(1);
}

const destino = process.argv[2] ?? SMTP_USER;
const porta = Number(SMTP_PORT);

const transporte = nodemailer.createTransport({
  host: SMTP_HOST,
  port: porta,
  secure: porta === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

console.log(`Conectando em ${SMTP_HOST}:${porta} (${porta === 465 ? "TLS direto" : "STARTTLS"})…`);

try {
  await transporte.verify();
  console.log("Autenticação aceita.");
} catch (e) {
  console.error("Falha ao conectar ou autenticar:", e.message);
  process.exit(1);
}

try {
  const info = await transporte.sendMail({
    from: `"${SMTP_FROM_NOME ?? "Suporte AB Solutions"}" <${SMTP_USER}>`,
    to: destino,
    subject: "[teste] Envio do suporte AB Solutions",
    text: "Se você recebeu esta mensagem, o envio por SMTP está funcionando.",
    html:
      '<div style="font-family:sans-serif;padding:16px">' +
      "<p>Se você recebeu esta mensagem, o envio por SMTP está funcionando.</p>" +
      "<p style=\"color:#666;font-size:13px\">Teste automático — pode ignorar.</p></div>",
  });
  console.log(`Enviado para ${destino}. ID: ${info.messageId}`);
  if (info.rejected?.length) console.warn("Recusados:", info.rejected.join(", "));
} catch (e) {
  console.error("Falha ao enviar:", e.message);
  process.exit(1);
}
