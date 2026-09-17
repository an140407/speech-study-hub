-- Fecha escrita direta nas tabelas de conteúdo educacional pra qualquer papel público.
-- Leitura (SELECT) continua liberada.
DROP POLICY IF EXISTS "public insert topics" ON public.topics;
DROP POLICY IF EXISTS "public update topics" ON public.topics;
DROP POLICY IF EXISTS "public insert materials" ON public.materials;
DROP POLICY IF EXISTS "public update materials" ON public.materials;
DROP POLICY IF EXISTS "public insert flashcards" ON public.flashcards;
DROP POLICY IF EXISTS "public update flashcards" ON public.flashcards;
DROP POLICY IF EXISTS "public insert mcq" ON public.mcq_questions;
DROP POLICY IF EXISTS "public update mcq" ON public.mcq_questions;

REVOKE INSERT, UPDATE ON public.topics, public.materials, public.flashcards, public.mcq_questions
  FROM anon, authenticated;

-- Função privilegiada (SECURITY DEFINER): roda com o dono da função, ignorando as
-- restrições acima só pra fazer exatamente essa gravação estruturada — não abre
-- INSERT/UPDATE livre de novo. Chamada via RPC, com a mesma chave pública de sempre.
CREATE OR REPLACE FUNCTION public.save_generated_material(
  p_topic text,
  p_summary text,
  p_mindmap jsonb,
  p_clinical_case jsonb,
  p_review_questions jsonb,
  p_flashcards jsonb,
  p_mcq jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topic_id uuid;
BEGIN
  INSERT INTO public.topics (title) VALUES (p_topic) RETURNING id INTO v_topic_id;

  INSERT INTO public.materials (topic_id, type, content) VALUES
    (v_topic_id, 'summary', jsonb_build_object('text', p_summary)),
    (v_topic_id, 'mindmap', p_mindmap),
    (v_topic_id, 'clinical_case', p_clinical_case),
    (v_topic_id, 'review_questions', jsonb_build_object('items', p_review_questions));

  INSERT INTO public.flashcards (topic_id, front, back)
  SELECT v_topic_id, f->>'front', f->>'back'
  FROM jsonb_array_elements(p_flashcards) f;

  INSERT INTO public.mcq_questions (topic_id, question, options, correct_index, explanation)
  SELECT v_topic_id, q->>'question', q->'options', (q->>'correct_index')::int, q->>'explanation'
  FROM jsonb_array_elements(p_mcq) q;

  RETURN v_topic_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_generated_material(text, text, jsonb, jsonb, jsonb, jsonb, jsonb)
  TO anon, authenticated;