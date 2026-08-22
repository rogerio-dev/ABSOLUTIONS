import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export type ResultadoDespacho = {
  enviados: number;
  falhas: number;
  configurado: boolean;
  detalhe?: string;
};

/**
 * Envia os e-mails pendentes da fila.
 *
 * Roda no servidor com o token do próprio usuário, então as políticas do banco
 * continuam valendo: ninguém dispara e-mail de chamado que não poderia ver.
 * É chamada logo após publicar uma mensagem, para a entrega ser imediata.
 */
export const despacharEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((entrada: { ticketId?: string | undefined }) => entrada)
  .handler(async ({ data, context }): Promise<ResultadoDespacho> => {
    const { smtpConfigurado, enviarEmail } = await import("@/lib/email.server");

    if (!smtpConfigurado()) {
      return {
        enviados: 0,
        falhas: 0,
        configurado: false,
        detalhe: "SMTP não configurado; as mensagens seguem na fila.",
      };
    }

    const supabase = context.supabase;

    const { data: linhas, error } = await supabase.rpc("emails_pendentes", {
      _ticket: data.ticketId ?? null,
      _limite: 20,
    });
    if (error) throw new Error(error.message);

    const pendentes = (linhas ?? []) as Pendente[];
    let enviados = 0;
    let falhas = 0;

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
        await supabase.rpc("marcar_email", { _id: p.id, _erro: null });
        enviados += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await supabase.rpc("marcar_email", { _id: p.id, _erro: msg });
        falhas += 1;
        console.error(`[suporte] falha ao enviar e-mail do chamado #${p.ticket_numero}: ${msg}`);
      }
    }

    return { enviados, falhas, configurado: true };
  });
