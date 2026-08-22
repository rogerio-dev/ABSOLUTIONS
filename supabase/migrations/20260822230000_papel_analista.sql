-- Valores novos de enum ficam sozinhos nesta migração.
--
-- O Postgres não deixa usar um valor de enum na mesma transação em que ele foi
-- criado. Separar evita que a migração seguinte, que já usa 'analista' e
-- 'em_espera', falhe.

-- Analista: perfil de suporte. Trata chamados, não enxerga o CRM.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'analista';

-- Em espera: parado por dependência de outra área interna.
-- Diferente de 'aguardando_cliente', o relógio do SLA continua correndo — a
-- pendência é nossa, e o cliente não tem culpa da fila interna.
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'em_espera' AFTER 'aguardando_cliente';
