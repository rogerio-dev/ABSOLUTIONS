-- Publica as tabelas do suporte no Realtime.
--
-- Sem isso, a fila só mudava quando alguém apertava F5 — e fila de suporte que
-- exige F5 é fila que atrasa: dois analistas pegam o mesmo chamado, a resposta
-- do cliente fica meia hora invisível, o SLA corre sem ninguém ver.
--
-- O Realtime respeita RLS: cada assinante só recebe evento de linha que já
-- poderia ler. O cliente do portal não fica sabendo de chamado alheio.

ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;

-- REPLICA IDENTITY FULL faz a linha inteira ir no evento, e não só a chave.
-- É o que permite ao Realtime aplicar RLS sobre o registro alterado, inclusive
-- em UPDATE e DELETE. Custa WAL a mais; nestas duas tabelas o volume é baixo.
ALTER TABLE public.tickets REPLICA IDENTITY FULL;
ALTER TABLE public.ticket_messages REPLICA IDENTITY FULL;
