-- Dono dos dados: tópicos criados antes do login existir ficam com user_id nulo
-- e simplesmente somem de todo mundo (não são apagados).
ALTER TABLE public.topics ADD COLUMN user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid();
ALTER TABLE public.exam_attempts ADD COLUMN user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid();

-- topics: leitura só do dono
DROP POLICY IF EXISTS "public select topics" ON public.topics;
CREATE POLICY "owner select topics" ON public.topics
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE SELECT ON public.topics FROM anon;

-- materials: leitura só de quem é dono do tópico relacionado
DROP POLICY IF EXISTS "public select materials" ON public.materials;
CREATE POLICY "owner select materials" ON public.materials
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = materials.topic_id AND t.user_id = auth.uid())
  );
REVOKE SELECT ON public.materials FROM anon;

-- flashcards: idem
DROP POLICY IF EXISTS "public select flashcards" ON public.flashcards;
CREATE POLICY "owner select flashcards" ON public.flashcards
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = flashcards.topic_id AND t.user_id = auth.uid())
  );
REVOKE SELECT ON public.flashcards FROM anon;

-- mcq_questions: idem
DROP POLICY IF EXISTS "public select mcq" ON public.mcq_questions;
CREATE POLICY "owner select mcq" ON public.mcq_questions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = mcq_questions.topic_id AND t.user_id = auth.uid())
  );
REVOKE SELECT ON public.mcq_questions FROM anon;

-- exam_attempts: cada um só grava e lê o próprio resultado (fecha o issue original direito)
DROP POLICY IF EXISTS "public insert exam_attempts" ON public.exam_attempts;
CREATE POLICY "owner insert exam_attempts" ON public.exam_attempts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner select exam_attempts" ON public.exam_attempts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, SELECT ON public.exam_attempts FROM anon;

-- a função que gera material passa a exigir login (fecha os dois warnings de "anon" de vez)
REVOKE EXECUTE ON FUNCTION public.save_generated_material(text, text, jsonb, jsonb, jsonb, jsonb, jsonb) FROM anon;