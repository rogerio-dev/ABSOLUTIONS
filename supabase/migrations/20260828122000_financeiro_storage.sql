-- Onde ficam as notas fiscais e os comprovantes.
--
-- Bucket privado, pelos mesmos motivos do bucket de contratos e com um a mais:
-- nota fiscal de fornecedor traz CNPJ, valor e, quando o prestador e pessoa
-- fisica, o CPF. Nada aqui pode ser alcancavel por URL adivinhada.
--
-- Diferente de `contratos`, este bucket nao tem leitura de cliente nenhuma: o
-- financeiro e do administrador, e so.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'financeiro', 'financeiro', false, 20971520,  -- 20 MB
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'text/xml', 'application/xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "financeiro admin" ON storage.objects;
CREATE POLICY "financeiro admin" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'financeiro' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'financeiro' AND public.has_role(auth.uid(), 'admin'));
