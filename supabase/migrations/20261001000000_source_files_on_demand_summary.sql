-- Bucket privado pro material original. Sem políticas pro navegador: só o servidor
-- (acesso privilegiado) grava, lê e apaga. Envio direto é feito por link assinado.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'source-files', 'source-files', false, 52428800,
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']
)
ON CONFLICT (id) DO NOTHING;

-- Registro dos arquivos guardados, pela impressão digital (SHA-256) do arquivo ENVIADO.
-- PPTX convertido fica registrado com a impressão do PPTX, guardando só o PDF.
CREATE TABLE public.source_files (
  hash text PRIMARY KEY CHECK (hash ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL CHECK (kind IN ('pdf', 'pptx')),
  storage_path text NOT NULL,
  size_bytes bigint,
  text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS ligado e sem políticas: invisível pro navegador, só o servidor acessa.
ALTER TABLE public.source_files ENABLE ROW LEVEL SECURITY;

-- Origem de cada tópico. source_hash só é preenchido quando o arquivo foi guardado.
ALTER TABLE public.topics ADD COLUMN source_hash text REFERENCES public.source_files(hash) ON DELETE SET NULL;
ALTER TABLE public.topics ADD COLUMN source_kind text CHECK (source_kind IN ('pdf', 'pptx'));
ALTER TABLE public.topics ADD COLUMN source_name text;
ALTER TABLE public.topics ADD COLUMN source_text text;
CREATE INDEX topics_source_hash_idx ON public.topics (source_hash);