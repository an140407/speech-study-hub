CREATE TABLE public.topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('summary','mindmap','clinical_case','review_questions')),
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  front text NOT NULL,
  back text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.mcq_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  question text NOT NULL,
  options jsonb NOT NULL,
  correct_index int NOT NULL,
  explanation text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_ids jsonb NOT NULL,
  answers jsonb NOT NULL,
  score int NOT NULL,
  total int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX materials_topic_idx ON public.materials(topic_id);
CREATE INDEX flashcards_topic_idx ON public.flashcards(topic_id);
CREATE INDEX mcq_topic_idx ON public.mcq_questions(topic_id);

GRANT SELECT, INSERT, UPDATE ON public.topics, public.materials, public.flashcards, public.mcq_questions, public.exam_attempts TO anon, authenticated;
GRANT ALL ON public.topics, public.materials, public.flashcards, public.mcq_questions, public.exam_attempts TO service_role;

ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcq_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public select topics" ON public.topics FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert topics" ON public.topics FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update topics" ON public.topics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public select materials" ON public.materials FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert materials" ON public.materials FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update materials" ON public.materials FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public select flashcards" ON public.flashcards FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert flashcards" ON public.flashcards FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update flashcards" ON public.flashcards FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public select mcq" ON public.mcq_questions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert mcq" ON public.mcq_questions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update mcq" ON public.mcq_questions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public select exam_attempts" ON public.exam_attempts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert exam_attempts" ON public.exam_attempts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update exam_attempts" ON public.exam_attempts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);