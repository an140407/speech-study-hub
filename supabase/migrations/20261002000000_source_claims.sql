-- Prova de posse: "usuário X provou que tem o arquivo H". Só o servidor grava, depois de receber os
-- bytes e conferir a impressão digital. Toda ação sobre um arquivo guardado exige esse registro.
CREATE TABLE public.source_claims (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hash text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hash)
);
-- RLS ligado e sem políticas: invisível pro navegador, só o servidor acessa.
ALTER TABLE public.source_claims ENABLE ROW LEVEL SECURITY;

-- Tópicos que já têm arquivo ligado: o dono enviou o arquivo quando criou o tópico.
INSERT INTO public.source_claims (user_id, hash)
SELECT DISTINCT user_id, source_hash
FROM public.topics
WHERE source_hash IS NOT NULL AND user_id IS NOT NULL
ON CONFLICT DO NOTHING;