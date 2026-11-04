-- ============================================================
-- FonoLab · atualização do banco para os recursos novos
-- Pastas (Disciplina › Unidade) · Registro de respostas / Caderno de erros / Relatório
-- Discursivas · Desempenho · Fluxograma e mnemônicos · Notas na margem
-- Várias fontes por tópico · Chat com o tópico
-- + correção de segurança em exam_attempts (alerta crítico do Lovable)
-- Rode UMA vez, inteiro, no Lovable Cloud → SQL editor, ANTES de publicar o código novo.
-- Se der erro, nada é gravado: copie a mensagem e não rode de novo antes de entender o erro.
-- Padrão do projeto: dado do usuário = RLS por dono; conteúdo protegido = função
-- SECURITY DEFINER que confere o dono do tópico.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Correção de um problema antigo do FonoLab: a leitura de exam_attempts foi revogada de
--    "authenticated" e nunca devolvida, então a contagem de provas sempre falhava.
--    A política "owner select exam_attempts" já limita a leitura ao dono.
-- ------------------------------------------------------------
GRANT SELECT ON public.exam_attempts TO authenticated;

-- Falha de segurança antiga do FonoLab (alerta "Anyone can change any record in exam_attempts"):
-- a migração inicial deixou UPDATE liberado para qualquer pessoa (USING true / WITH CHECK true).
-- O app nunca altera uma prova depois de gravada, então a regra e a permissão saem.
-- IF EXISTS: funciona mesmo se o "Try to fix" do Lovable já tiver removido a regra.
DROP POLICY IF EXISTS "public update exam_attempts" ON public.exam_attempts;
REVOKE UPDATE, DELETE ON public.exam_attempts FROM anon, authenticated;

-- ------------------------------------------------------------
-- 1. Pastas: Módulo › Problema (2 níveis)
-- ------------------------------------------------------------
CREATE TABLE public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.folders(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX folders_user_idx ON public.folders (user_id, parent_id, position);

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all folders" ON public.folders
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE ALL ON public.folders FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO authenticated;

-- Só 2 níveis: um problema fica dentro de um módulo (pasta sem pai) do mesmo dono.
CREATE OR REPLACE FUNCTION public.check_folder_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'Uma pasta não pode ficar dentro dela mesma.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.folders p
      WHERE p.id = NEW.parent_id AND p.user_id = NEW.user_id AND p.parent_id IS NULL
    ) THEN
      RAISE EXCEPTION 'Um problema só pode ficar dentro de um módulo seu.';
    END IF;
    IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.folders c WHERE c.parent_id = NEW.id) THEN
      RAISE EXCEPTION 'Um módulo que tem problemas não pode virar problema.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER folders_parent_check
  BEFORE INSERT OR UPDATE OF parent_id ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.check_folder_parent();

-- Tópico pode ficar num módulo ou num problema; ao apagar a pasta, volta para "Sem pasta".
ALTER TABLE public.topics ADD COLUMN folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL;
CREATE INDEX topics_folder_idx ON public.topics (folder_id);

CREATE OR REPLACE FUNCTION public.check_topic_folder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.folders f WHERE f.id = NEW.folder_id AND f.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Pasta não encontrada.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER topics_folder_check
  BEFORE INSERT OR UPDATE OF folder_id ON public.topics
  FOR EACH ROW EXECUTE FUNCTION public.check_topic_folder();

-- ------------------------------------------------------------
-- 2. Registro de cada resposta de questão objetiva
--    (prática, prova e caderno de erros). O banco calcula acerto e tópico.
-- ------------------------------------------------------------
CREATE TABLE public.mcq_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.mcq_questions(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  chosen_index smallint NOT NULL CHECK (chosen_index BETWEEN 0 AND 3),
  is_correct boolean NOT NULL,
  source text NOT NULL CHECK (source IN ('pratica', 'prova', 'erros')),
  exam_attempt_id uuid REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mcq_attempts_question_idx ON public.mcq_attempts (user_id, question_id, created_at DESC);
CREATE INDEX mcq_attempts_topic_idx ON public.mcq_attempts (user_id, topic_id, created_at DESC);
CREATE INDEX mcq_attempts_exam_idx ON public.mcq_attempts (exam_attempt_id);

ALTER TABLE public.mcq_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner select mcq_attempts" ON public.mcq_attempts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner insert mcq_attempts" ON public.mcq_attempts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner delete mcq_attempts" ON public.mcq_attempts
  FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.mcq_attempts FROM anon;
GRANT SELECT, INSERT, DELETE ON public.mcq_attempts TO authenticated;

CREATE OR REPLACE FUNCTION public.fill_mcq_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topic uuid;
  v_correct integer;
BEGIN
  SELECT q.topic_id, q.correct_index INTO v_topic, v_correct
  FROM public.mcq_questions q
  JOIN public.topics t ON t.id = q.topic_id
  WHERE q.id = NEW.question_id AND t.user_id = auth.uid();
  IF v_topic IS NULL THEN
    RAISE EXCEPTION 'Questão não encontrada ou sem permissão.';
  END IF;
  IF NEW.exam_attempt_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.exam_attempts e WHERE e.id = NEW.exam_attempt_id AND e.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Prova não encontrada.';
  END IF;
  NEW.user_id := auth.uid();
  NEW.topic_id := v_topic;
  NEW.is_correct := (NEW.chosen_index = v_correct);
  RETURN NEW;
END;
$$;
CREATE TRIGGER mcq_attempts_fill
  BEFORE INSERT ON public.mcq_attempts
  FOR EACH ROW EXECUTE FUNCTION public.fill_mcq_attempt();

-- Flashcard criado a partir de um erro guarda a questão de origem.
ALTER TABLE public.flashcards
  ADD COLUMN origin_mcq_id uuid REFERENCES public.mcq_questions(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 3. Questões discursivas e respostas corrigidas pela IA
-- ------------------------------------------------------------
CREATE TABLE public.essay_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 4000),
  expected_answer text NOT NULL DEFAULT '',
  rubric jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{ "item": "string", "points": number }]
  subtopic text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX essay_questions_topic_idx ON public.essay_questions (topic_id, created_at);

ALTER TABLE public.essay_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all essay_questions" ON public.essay_questions
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = essay_questions.topic_id AND t.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = essay_questions.topic_id AND t.user_id = auth.uid())
  );
REVOKE ALL ON public.essay_questions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.essay_questions TO authenticated;

CREATE TABLE public.essay_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.essay_questions(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  answer text NOT NULL CHECK (char_length(answer) BETWEEN 1 AND 10000),
  score numeric(4,1) CHECK (score BETWEEN 0 AND 10),
  feedback jsonb, -- { "acertos": [], "faltou": [], "erros": [], "comentario": "" }
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX essay_answers_question_idx ON public.essay_answers (user_id, question_id, created_at DESC);
CREATE INDEX essay_answers_topic_idx ON public.essay_answers (user_id, topic_id, created_at DESC);

ALTER TABLE public.essay_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all essay_answers" ON public.essay_answers
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE ALL ON public.essay_answers FROM anon;
GRANT SELECT, INSERT, DELETE ON public.essay_answers TO authenticated;

CREATE OR REPLACE FUNCTION public.fill_essay_answer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topic uuid;
BEGIN
  SELECT q.topic_id INTO v_topic
  FROM public.essay_questions q
  JOIN public.topics t ON t.id = q.topic_id
  WHERE q.id = NEW.question_id AND t.user_id = auth.uid();
  IF v_topic IS NULL THEN
    RAISE EXCEPTION 'Questão não encontrada ou sem permissão.';
  END IF;
  NEW.user_id := auth.uid();
  NEW.topic_id := v_topic;
  RETURN NEW;
END;
$$;
CREATE TRIGGER essay_answers_fill
  BEFORE INSERT ON public.essay_answers
  FOR EACH ROW EXECUTE FUNCTION public.fill_essay_answer();

-- ------------------------------------------------------------
-- 4. Notas pessoais na margem do resumo (presas ao bloco, como os grifos)
-- ------------------------------------------------------------
CREATE TABLE public.topic_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  block_index integer NOT NULL CHECK (block_index >= 0),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX topic_notes_topic_idx ON public.topic_notes (topic_id, block_index);

ALTER TABLE public.topic_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all topic_notes" ON public.topic_notes
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_notes.topic_id AND t.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_notes.topic_id AND t.user_id = auth.uid())
  );
REVOKE ALL ON public.topic_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_notes TO authenticated;

-- ------------------------------------------------------------
-- 5. Várias fontes por tópico (PDF, PPTX ou texto)
--    merged_at = quando o conteúdo da fonte entrou no material do tópico.
-- ------------------------------------------------------------
CREATE TABLE public.topic_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  hash text REFERENCES public.source_files(hash) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('pdf', 'pptx', 'texto')),
  name text,
  text text,
  position integer NOT NULL DEFAULT 0,
  merged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX topic_sources_topic_idx ON public.topic_sources (topic_id, position);

ALTER TABLE public.topic_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all topic_sources" ON public.topic_sources
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_sources.topic_id AND t.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_sources.topic_id AND t.user_id = auth.uid())
  );
REVOKE ALL ON public.topic_sources FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_sources TO authenticated;

-- A fonte original de cada tópico existente vira a fonte nº 0 (o texto continua em topics.source_text).
INSERT INTO public.topic_sources (topic_id, hash, kind, name, position, merged_at, created_at)
SELECT t.id, t.source_hash, t.source_kind, t.source_name, 0, t.created_at, t.created_at
FROM public.topics t
WHERE t.source_kind IS NOT NULL;

-- ------------------------------------------------------------
-- 6. Chat com o tópico (histórico salvo por tópico)
-- ------------------------------------------------------------
CREATE TABLE public.topic_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX topic_chat_topic_idx ON public.topic_chat_messages (topic_id, created_at);

ALTER TABLE public.topic_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all topic_chat_messages" ON public.topic_chat_messages
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_chat_messages.topic_id AND t.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_chat_messages.topic_id AND t.user_id = auth.uid())
  );
REVOKE ALL ON public.topic_chat_messages FROM anon;
GRANT SELECT, INSERT, DELETE ON public.topic_chat_messages TO authenticated;

-- ------------------------------------------------------------
-- 7. Novos tipos de material: fluxograma e mnemônicos
-- ------------------------------------------------------------
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.materials'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE public.materials DROP CONSTRAINT %I', c.conname);
  END LOOP;
END;
$$;
ALTER TABLE public.materials ADD CONSTRAINT materials_type_check
  CHECK (type IN ('summary', 'mindmap', 'clinical_case', 'review_questions', 'flowchart', 'mnemonics'));

-- Grava (substituindo) um material gerado por IA. Confere o dono do tópico.
CREATE OR REPLACE FUNCTION public.set_topic_material(p_topic_id uuid, p_type text, p_content jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_type NOT IN ('flowchart', 'mnemonics', 'mindmap', 'review_questions') THEN
    RAISE EXCEPTION 'Tipo de material não permitido.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.topics WHERE id = p_topic_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Tópico não encontrado ou sem permissão.';
  END IF;
  DELETE FROM public.materials WHERE topic_id = p_topic_id AND type = p_type;
  INSERT INTO public.materials (topic_id, type, content) VALUES (p_topic_id, p_type, p_content);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_topic_material(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_topic_material(uuid, text, jsonb) TO authenticated;

-- Funções de gatilho não são chamadas direto por ninguém.
REVOKE EXECUTE ON FUNCTION public.check_folder_parent() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_topic_folder() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fill_mcq_attempt() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fill_essay_answer() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 8. Flashcards criados pelo próprio aluno (inclusive "Criar flashcard" no Caderno de erros).
--    A migração de set/2026 ficou numa pasta errada (supabase/migrations/supabase) e pode
--    não ter rodado: aqui as regras são recriadas, sem duplicar se já existirem.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "owner insert flashcards" ON public.flashcards;
CREATE POLICY "owner insert flashcards" ON public.flashcards
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = flashcards.topic_id AND t.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "owner update flashcards" ON public.flashcards;
CREATE POLICY "owner update flashcards" ON public.flashcards
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = flashcards.topic_id AND t.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = flashcards.topic_id AND t.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "owner delete flashcards" ON public.flashcards;
CREATE POLICY "owner delete flashcards" ON public.flashcards
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = flashcards.topic_id AND t.user_id = auth.uid())
  );
GRANT INSERT, UPDATE, DELETE ON public.flashcards TO authenticated;

-- ------------------------------------------------------------
-- 9. Notas na margem: guarda o começo do parágrafo anotado, para a nota continuar
--    no lugar certo depois de inserir tabelas, explicações ou editar o resumo.
-- ------------------------------------------------------------
ALTER TABLE public.topic_notes
  ADD COLUMN IF NOT EXISTS anchor_text text
  CHECK (anchor_text IS NULL OR char_length(anchor_text) <= 300);

-- Avisa a API do banco que as tabelas mudaram (senão ela pode demorar para enxergar as novas)
NOTIFY pgrst, 'reload schema';

-- Conferência: deve listar as 7 tabelas novas
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('folders', 'mcq_attempts', 'essay_questions', 'essay_answers', 'topic_notes', 'topic_sources', 'topic_chat_messages')
ORDER BY table_name;
