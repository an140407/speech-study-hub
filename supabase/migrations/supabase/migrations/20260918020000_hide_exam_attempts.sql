-- Ninguém lê exam_attempts de volta no app (só é gravada, nunca consultada) —
-- então dá pra fechar a leitura pública de graça, sem afetar nenhuma tela.
DROP POLICY IF EXISTS "public select exam_attempts" ON public.exam_attempts;
REVOKE SELECT ON public.exam_attempts FROM anon, authenticated;