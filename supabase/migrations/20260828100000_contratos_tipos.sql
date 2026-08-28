-- Tipos do módulo de contratos. Ficam sozinhos porque o Postgres não deixa
-- usar um valor de enum na mesma transação em que ele foi criado.

-- Como a consultoria cobra. É a decisão que muda tudo o mais no contrato:
-- o que se mede, o que se fatura e o que o cliente pode exigir.
CREATE TYPE public.contrato_modalidade AS ENUM (
  'banco_horas',    -- pacote de horas por mês, com saldo
  'fixo_mensal',    -- valor fixo por mês: sustentação e suporte
  'projeto',        -- escopo e preço fechados, com início e fim
  'horas_avulsas',  -- sob demanda, faturado pelo que se usou
  'alocacao'        -- profissional dedicado, por período
);

CREATE TYPE public.contrato_situacao AS ENUM (
  'rascunho', 'em_negociacao', 'ativo', 'suspenso', 'encerrado', 'cancelado'
);

CREATE TYPE public.contrato_reajuste AS ENUM ('nenhum', 'ipca', 'igpm', 'inpc', 'outro');

CREATE TYPE public.documento_tipo AS ENUM (
  'contrato_assinado', 'aditivo', 'proposta', 'ordem_servico', 'nda', 'anexo_tecnico', 'outro'
);
