-- ============================================================
-- FASE 1: fundação de dados para grifos, sub-tópicos, casos
-- clínicos múltiplos, cronômetro de prova e progresso.
-- ============================================================

-- Sub-tópico + rastreio de "visto" em flashcards e questões
ALTER TABLE public.flashcards ADD COLUMN subtopic text;
ALTER TABLE public.flashcards ADD COLUMN seen_at timestamptz;
ALTER TABLE public.mcq_questions ADD COLUMN subtopic text;
ALTER TABLE public.mcq_questions ADD COLUMN seen_at timestamptz;
ALTER TABLE public.mcq_questions ADD COLUMN ai_explanation text;

-- Tempos de prova
ALTER TABLE public.exam_attempts ADD COLUMN question_seconds jsonb;
ALTER TABLE public.exam_attempts ADD COLUMN total_seconds integer;

-- Casos clínicos: tabela própria (suporta múltiplos casos por tópico,
-- resposta nativa por pergunta guiada, e explicação do caso inteiro)
CREATE TABLE public.clinical_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  scenario text NOT NULL,
  guiding_questions jsonb NOT NULL, -- [{ question, answer, ai_explanation }]
  case_explanation text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clinical_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner select clinical_cases" ON public.clinical_cases
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = clinical_cases.topic_id AND t.user_id = auth.uid())
  );

-- Migra os casos clínicos existentes (guardados em materials) pra tabela nova.
-- guiding_questions viram objetos { question, answer: null, ai_explanation: null },
-- e são preenchidos na primeira vez que o caso for aberto (backfill sob demanda).
INSERT INTO public.clinical_cases (topic_id, scenario, guiding_questions, case_explanation, created_at)
SELECT
  m.topic_id,
  m.content->>'scenario',
  (
    SELECT jsonb_agg(jsonb_build_object('question', q, 'answer', null, 'ai_explanation', null))
    FROM jsonb_array_elements_text(m.content->'guiding_questions') AS q
  ),
  null,
  m.created_at
FROM public.materials m
WHERE m.type = 'clinical_case';

DELETE FROM public.materials WHERE type = 'clinical_case';

-- Grifos (highlight) — dado do usuário, não gerado por IA, então CRUD direto
-- com RLS por dono, sem precisar de função privilegiada.
CREATE TABLE public.highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('resumo', 'caso_clinico', 'revisao')),
  case_id uuid REFERENCES public.clinical_cases(id) ON DELETE CASCADE,
  start_offset integer NOT NULL,
  end_offset integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all highlights" ON public.highlights
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = highlights.topic_id AND t.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = highlights.topic_id AND t.user_id = auth.uid())
  );
GRANT SELECT, INSERT, DELETE ON public.highlights TO authenticated;

-- ============================================================
-- save_generated_material: agora grava subtopic em flashcards/mcq,
-- e grava o caso clínico na tabela clinical_cases em vez de materials.
-- ============================================================
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
    (v_topic_id, 'review_questions', jsonb_build_object('items', p_review_questions));

  INSERT INTO public.clinical_cases (topic_id, scenario, guiding_questions, case_explanation)
  VALUES (
    v_topic_id,
    p_clinical_case->>'scenario',
    p_clinical_case->'guiding_questions',
    p_clinical_case->>'case_explanation'
  );

  INSERT INTO public.flashcards (topic_id, front, back, subtopic)
  SELECT v_topic_id, f->>'front', f->>'back', f->>'subtopic'
  FROM jsonb_array_elements(p_flashcards) f;

  INSERT INTO public.mcq_questions (topic_id, question, options, correct_index, explanation, subtopic)
  SELECT v_topic_id, q->>'question', q->'options', (q->>'correct_index')::int, q->>'explanation', q->>'subtopic'
  FROM jsonb_array_elements(p_mcq) q;

  RETURN v_topic_id;
END;
$$;

-- ============================================================
-- Funções auxiliares (todas checam dono do tópico internamente,
-- porque são SECURITY DEFINER e ignoram RLS por padrão)
-- ============================================================

CREATE OR REPLACE FUNCTION public.add_flashcards(p_topic_id uuid, p_flashcards jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.topics WHERE id = p_topic_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Tópico não encontrado ou sem permissão.';
  END IF;

  SELECT count(*) INTO v_count FROM public.flashcards WHERE topic_id = p_topic_id;
  IF v_count + jsonb_array_length(p_flashcards) > 100 THEN
    RAISE EXCEPTION 'Limite de 100 flashcards por tópico.';
  END IF;

  INSERT INTO public.flashcards (topic_id, front, back, subtopic)
  SELECT p_topic_id, f->>'front', f->>'back', f->>'subtopic'
  FROM jsonb_array_elements(p_flashcards) f;

  RETURN v_count + jsonb_array_length(p_flashcards);
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_flashcards(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_mcq_questions(p_topic_id uuid, p_mcq jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.topics WHERE id = p_topic_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Tópico não encontrado ou sem permissão.';
  END IF;

  SELECT count(*) INTO v_count FROM public.mcq_questions WHERE topic_id = p_topic_id;
  IF v_count + jsonb_array_length(p_mcq) > 50 THEN
    RAISE EXCEPTION 'Limite de 50 questões por tópico.';
  END IF;

  INSERT INTO public.mcq_questions (topic_id, question, options, correct_index, explanation, subtopic)
  SELECT p_topic_id, q->>'question', q->'options', (q->>'correct_index')::int, q->>'explanation', q->>'subtopic'
  FROM jsonb_array_elements(p_mcq) q;

  RETURN v_count + jsonb_array_length(p_mcq);
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_mcq_questions(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_clinical_case(
  p_topic_id uuid, p_scenario text, p_guiding_questions jsonb, p_case_explanation text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_case_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.topics WHERE id = p_topic_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Tópico não encontrado ou sem permissão.';
  END IF;

  SELECT count(*) INTO v_count FROM public.clinical_cases WHERE topic_id = p_topic_id;
  IF v_count >= 5 THEN
    RAISE EXCEPTION 'Limite de 5 casos clínicos por tópico.';
  END IF;

  INSERT INTO public.clinical_cases (topic_id, scenario, guiding_questions, case_explanation)
  VALUES (p_topic_id, p_scenario, p_guiding_questions, p_case_explanation)
  RETURNING id INTO v_case_id;

  RETURN v_case_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_clinical_case(uuid, text, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_clinical_case_content(
  p_case_id uuid, p_guiding_questions jsonb, p_case_explanation text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clinical_cases c
  SET guiding_questions = p_guiding_questions, case_explanation = p_case_explanation
  WHERE c.id = p_case_id
    AND EXISTS (SELECT 1 FROM public.topics t WHERE t.id = c.topic_id AND t.user_id = auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caso não encontrado ou sem permissão.';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_clinical_case_content(uuid, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_mcq_explanation(p_mcq_id uuid, p_ai_explanation text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.mcq_questions q
  SET ai_explanation = p_ai_explanation
  WHERE q.id = p_mcq_id
    AND EXISTS (SELECT 1 FROM public.topics t WHERE t.id = q.topic_id AND t.user_id = auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Questão não encontrada ou sem permissão.';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_mcq_explanation(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_flashcard_subtopic(p_flashcard_id uuid, p_subtopic text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.flashcards f
  SET subtopic = p_subtopic
  WHERE f.id = p_flashcard_id
    AND EXISTS (SELECT 1 FROM public.topics t WHERE t.id = f.topic_id AND t.user_id = auth.uid());
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_flashcard_subtopic(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_mcq_subtopic(p_mcq_id uuid, p_subtopic text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.mcq_questions q
  SET subtopic = p_subtopic
  WHERE q.id = p_mcq_id
    AND EXISTS (SELECT 1 FROM public.topics t WHERE t.id = q.topic_id AND t.user_id = auth.uid());
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_mcq_subtopic(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_flashcard_seen(p_flashcard_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.flashcards f
  SET seen_at = now()
  WHERE f.id = p_flashcard_id
    AND EXISTS (SELECT 1 FROM public.topics t WHERE t.id = f.topic_id AND t.user_id = auth.uid());
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_flashcard_seen(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_mcq_seen(p_mcq_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.mcq_questions q
  SET seen_at = now()
  WHERE q.id = p_mcq_id
    AND EXISTS (SELECT 1 FROM public.topics t WHERE t.id = q.topic_id AND t.user_id = auth.uid());
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_mcq_seen(uuid) TO authenticated;

-- Novas funções não devem ser chamáveis por anon (mesmo padrão da save_generated_material)
REVOKE EXECUTE ON FUNCTION public.add_flashcards(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_mcq_questions(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_clinical_case(uuid, text, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_clinical_case_content(uuid, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_mcq_explanation(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_flashcard_subtopic(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_mcq_subtopic(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_flashcard_seen(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_mcq_seen(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_generated_material(text, text, jsonb, jsonb, jsonb, jsonb, jsonb) FROM anon;