import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mantém a tela de suporte acordada.
 *
 * Fila que exige F5 é fila que atrasa: dois analistas pegam o mesmo chamado, a
 * resposta do cliente fica meia hora invisível, o SLA corre sem ninguém ver.
 *
 * O caminho principal é o Realtime do Postgres, que empurra a mudança no
 * instante em que ela acontece e respeita RLS — cada assinante só recebe evento
 * de linha que já poderia ler. Mas WebSocket cai: rede corporativa bloqueia,
 * proxy derruba, notebook dorme. Por isso a função devolve `aoVivo`, e quem
 * chama usa isso para ligar uma recarga periódica enquanto o canal estiver
 * fora. Assim o pior caso é atraso, nunca tela congelada.
 */
export function useSuporteAoVivo(ticketId?: string): { aoVivo: boolean } {
  const qc = useQueryClient();
  const [aoVivo, setAoVivo] = useState(false);
  const agendado = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (typeof window === "undefined") return;

    /*
     * Uma rajada de mudanças (a equipe responde, o gatilho mexe no status, o
     * e-mail entra na fila) chega como vários eventos em sequência. Sem esta
     * espera curta, seriam várias recargas para a mesma coisa.
     */
    const recarregar = () => {
      if (agendado.current) clearTimeout(agendado.current);
      agendado.current = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["tickets"] });
        qc.invalidateQueries({ queryKey: ["emails-pendentes"] });
        if (ticketId) {
          qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
          qc.invalidateQueries({ queryKey: ["ticket-mensagens", ticketId] });
        }
      }, 250);
    };

    let vivo = true;
    const canal = supabase
      .channel(ticketId ? `suporte-${ticketId}` : "suporte-fila")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, recarregar)
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_messages" }, recarregar);

    // O token do usuário precisa chegar ao Realtime, senão a RLS o trata como
    // anônimo e nenhum evento passa.
    void supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      canal.subscribe((estado) => {
        if (!vivo) return;
        setAoVivo(estado === "SUBSCRIBED");
        // Reconectar caído sem recarregar deixaria a tela com dados velhos do
        // período em que o canal esteve fora.
        if (estado === "SUBSCRIBED") recarregar();
      });
    });

    return () => {
      vivo = false;
      if (agendado.current) clearTimeout(agendado.current);
      void supabase.removeChannel(canal);
    };
  }, [qc, ticketId]);

  return { aoVivo };
}

/**
 * Intervalo de recarga automática.
 *
 * Com o canal no ar, o Realtime já avisa; a recarga aqui é só uma rede de
 * segurança rara. Com o canal fora, ela é a única coisa mantendo a tela atual,
 * então aperta o passo.
 */
export function intervaloDeRecarga(aoVivo: boolean): number {
  return aoVivo ? 120_000 : 20_000;
}
