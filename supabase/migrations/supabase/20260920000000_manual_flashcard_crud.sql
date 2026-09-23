-- Permite ao dono do tópico criar e editar flashcards manualmente (sem IA),
-- direto pelo cliente autenticado — diferente do conteúdo gerado por IA
-- (que continua só passando pela função privilegiada). Mesmo padrão usado em
-- "highlights": dado de autoria do próprio usuário, RLS por dono já basta.
CREATE POLICY "owner insert flashcards" ON public.flashcards
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = flashcards.topic_id AND t.user_id = auth.uid())
  );
CREATE POLICY "owner update flashcards" ON public.flashcards
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = flashcards.topic_id AND t.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = flashcards.topic_id AND t.user_id = auth.uid())
  );
CREATE POLICY "owner delete flashcards" ON public.flashcards
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = flashcards.topic_id AND t.user_id = auth.uid())
  );
GRANT INSERT, UPDATE, DELETE ON public.flashcards TO authenticated;