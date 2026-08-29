-- Tipos do módulo financeiro. Sozinhos porque o Postgres não deixa usar um
-- valor de enum na mesma transação em que ele foi criado.

-- Como um colaborador é pago.
--
-- 'por_task' é a modalidade que resolve o problema real: o desenvolvedor não
-- aponta hora nenhuma. A hora já está orçada no card antes de ele começar, e
-- ele recebe pelo card concluído. Quem estima é quem planeja o projeto, e a
-- conta fecha com o que foi vendido ao cliente — não com o que alguém digitou
-- no fim do mês.
CREATE TYPE public.pagamento_modalidade AS ENUM (
  'fixo_mensal',   -- valor fixo por mês, independente do volume
  'por_task',      -- recebe pelas horas orçadas nos cards concluídos
  'por_hora',      -- hora apontada e aprovada, para casos excepcionais
  'sem_custo'      -- sócio ou o próprio dono; entra na conta sem gerar título
);

CREATE TYPE public.pessoa_tipo AS ENUM ('pf', 'pj');

-- Situação de um título, a receber ou a pagar.
CREATE TYPE public.titulo_situacao AS ENUM (
  'previsto',   -- projetado, ainda não faturado
  'emitido',    -- nota emitida ou boleto enviado
  'pago',
  'cancelado'
);

CREATE TYPE public.pagamento_tipo AS ENUM (
  'colaborador', 'fornecedor', 'imposto', 'despesa'
);

CREATE TYPE public.conta_tipo AS ENUM ('corrente', 'poupanca', 'caixa', 'aplicacao');

CREATE TYPE public.financeiro_documento_tipo AS ENUM (
  'nf_emitida',    -- a nota que emitimos para o cliente
  'nf_recebida',   -- a nota que o fornecedor ou o dev emitiu para nós
  'boleto',
  'comprovante',
  'contrato',
  'outro'
);
