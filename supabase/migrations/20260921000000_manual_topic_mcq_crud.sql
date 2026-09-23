-- Renomear/excluir tópico (dono) e criar/editar/excluir questões manualmente,
-- mesmo padrão já usado em flashcards e highlights: dado do próprio usuário,
-- RLS por dono já basta, sem precisar de função privilegiada.
CREATE POLICY "owner update topics" ON public.topics
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner delete topics" ON public.topics
  FOR DELETE TO authenticated USING (user_id = auth.uid());
GRANT UPDATE, DELETE ON public.topics TO authenticated;

CREATE POLICY "owner insert mcq" ON public.mcq_questions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = mcq_questions.topic_id AND t.user_id = auth.uid())
  );
CREATE POLICY "owner update mcq" ON public.mcq_questions
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = mcq_questions.topic_id AND t.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = mcq_questions.topic_id AND t.user_id = auth.uid())
  );
CREATE POLICY "owner delete mcq" ON public.mcq_questions
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = mcq_questions.topic_id AND t.user_id = auth.uid())
  );
GRANT INSERT, UPDATE, DELETE ON public.mcq_questions TO authenticated;
-- (a política de excluir flashcards já existe desde a migration anterior — só faltava o botão na tela)