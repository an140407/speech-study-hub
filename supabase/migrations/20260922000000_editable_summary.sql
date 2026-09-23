-- Resumo passa a ser editável pelo dono (só o tipo 'summary' — mindmap e
-- review_questions continuam protegidos, escritos só pela função privilegiada).
CREATE POLICY "owner update summary" ON public.materials
  FOR UPDATE TO authenticated USING (
    type = 'summary' AND EXISTS (SELECT 1 FROM public.topics t WHERE t.id = materials.topic_id AND t.user_id = auth.uid())
  ) WITH CHECK (
    type = 'summary' AND EXISTS (SELECT 1 FROM public.topics t WHERE t.id = materials.topic_id AND t.user_id = auth.uid())
  );
GRANT UPDATE ON public.materials TO authenticated;