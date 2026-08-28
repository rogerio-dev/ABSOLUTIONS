-- Tipos do módulo de prospecção. Sozinhos porque o Postgres não deixa usar um
-- valor de enum na mesma transação em que ele foi criado.

-- O caminho de um alvo dentro de uma onda. Não é o funil: aqui ainda é
-- abordagem fria, sem valor e sem previsão de fechamento. Quem responde e
-- demonstra interesse sai daqui e vira oportunidade no funil.
CREATE TYPE public.alvo_situacao AS ENUM (
  'a_contatar',
  'tentando',            -- já houve tentativa, sem resposta ainda
  'respondeu',
  'reuniao_marcada',
  'virou_oportunidade',  -- promovido ao funil
  'descartado'
);
