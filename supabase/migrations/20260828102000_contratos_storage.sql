-- Onde ficam os arquivos de contrato.
--
-- Bucket privado: contrato assinado tem CNPJ, valores, nome e assinatura de
-- gente. Nada aqui pode ser alcançável por URL adivinhada — o acesso sai sempre
-- de uma URL assinada de curta duração, gerada para quem já provou ter direito.
--
-- O caminho é sempre `<contract_id>/<arquivo>`. Não é convenção estética: as
-- políticas abaixo leem o primeiro segmento para descobrir de que contrato o
-- arquivo é, e daí decidir quem pode ver.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contratos', 'contratos', false, 26214400,  -- 25 MB
  ARRAY[
    'application/pdf',
    'image/png', 'image/jpeg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- A equipe administra os arquivos.
DROP POLICY IF EXISTS "contratos staff" ON storage.objects;
CREATE POLICY "contratos staff" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'contratos' AND public.is_staff())
  WITH CHECK (bucket_id = 'contratos' AND public.is_staff());

-- O cliente lê apenas o que está marcado como visível, no contrato dele.
-- A checagem passa pela tabela de documentos de propósito: assim, desmarcar
-- "visível para o cliente" corta o acesso ao arquivo no mesmo gesto, sem
-- precisar mover nada de lugar.
DROP POLICY IF EXISTS "contratos leitura do cliente" ON storage.objects;
CREATE POLICY "contratos leitura do cliente" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'contratos'
    AND EXISTS (
      SELECT 1
        FROM public.contract_documentos d
        JOIN public.contracts c ON c.id = d.contract_id
       WHERE d.caminho = storage.objects.name
         AND d.visivel_cliente
         AND c.client_id = public.my_client_id()
    )
  );
