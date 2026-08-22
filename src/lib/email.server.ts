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

/** Domínio do remetente, sem o nome e sem os sinais de menor/maior. */
function dominioDoRemetente(): string {
  const bruto = remetente().split("@").pop() ?? "absolutionsconsultoria.com.br";
  return bruto.replace(/[>\s]/g, "");
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
  return `<chamado-${m.numero}@${dominioDoRemetente()}>`;
}

/** Trecho que alguns clientes mostram ao lado do assunto, antes de abrir. */
function preheader(m: EmailParaEnviar): string {
  return m.corpo.replace(/\s+/g, " ").trim().slice(0, 110);
}

/**
 * Modelo em HTML pensado para chegar, não para impressionar.
 *
 * As escolhas puxam todas para o conservador, porque cliente de e-mail
 * corporativo é ambiente hostil:
 *
 *   - fundo claro. O tema escuro do site vira mancha ilegível no Outlook, que
 *     ignora cor de fundo em body, e alguns clientes invertem cores por conta
 *     própria e estragam o resultado;
 *   - tabelas com estilo inline. O Outlook renderiza com o motor do Word:
 *     flexbox, grid e folha de estilo no cabeçalho são descartados;
 *   - nenhuma imagem, nenhuma fonte externa, nenhum rastreador. Imagem é
 *     bloqueada por padrão e deixa buraco, e recurso externo pesa no filtro;
 *   - fontes do sistema, largura máxima de 600px, tudo curto. O corte do Gmail
 *     em 102KB nunca chega perto.
 *
 * O texto puro que acompanha não é enfeite: é o que aparece em leitor de tela,
 * em relógio e em cliente que recusa HTML.
 */
function montarHtml(m: EmailParaEnviar): string {
  const paragrafos = escapar(m.corpo)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1f2937;">${p.replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  const cabecalho = m.numero ? `Chamado #${m.numero}` : "Suporte";
  const assuntoLimpo = escapar(m.assunto.replace(/^\[#\d+\]\s*/, ""));
  const divisor =
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr><td style="padding:18px 0;">' +
    '<div style="height:1px;background-color:#e5e7eb;line-height:1px;font-size:0;">&nbsp;</div>' +
    "</td></tr></table>";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapar(cabecalho)}</title>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#f1f3f6;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapar(preheader(m))}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f3f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
          <tr>
            <td style="padding:0 4px 12px;font-family:${FONTE};font-size:13px;color:#6b7280;">
              <strong style="color:#111827;font-size:15px;">AB Solutions</strong>
              &nbsp;&middot;&nbsp; Suporte TOTVS Fluig
            </td>
          </tr>

          <tr>
            <td style="background-color:#ffffff;border:1px solid #e2e5ea;border-radius:8px;padding:24px;font-family:${FONTE};">

              <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#0e7490;">
                ${escapar(cabecalho)}
              </p>
              <p style="margin:0;font-size:18px;font-weight:600;line-height:1.35;color:#111827;">
                ${assuntoLimpo}
              </p>
              ${m.cliente ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${escapar(m.cliente)}</p>` : ""}

              ${divisor}

              ${m.autor ? `<p style="margin:0 0 12px;font-size:13px;color:#6b7280;"><strong style="color:#111827;">${escapar(m.autor)}</strong> escreveu:</p>` : ""}
              ${paragrafos || '<p style="margin:0;font-size:15px;line-height:1.6;color:#1f2937;">&nbsp;</p>'}

              ${divisor}

              <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">
                Responda este e-mail para continuar no mesmo chamado. Sua resposta entra
                automaticamente no histórico e a equipe é avisada.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 4px 0;font-family:${FONTE};font-size:12px;line-height:1.6;color:#9099a8;">
              AB Solutions &middot; Consultoria TOTVS Fluig<br>
              ${TELEFONE} &middot; ${SITE}
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
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
