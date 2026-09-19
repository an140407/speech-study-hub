-- A abordagem de grifo mudou: agora cada grifo é relativo a um bloco de texto
-- (parágrafo/item/pergunta) em vez do texto inteiro da aba. Isso torna o cálculo
-- de posição estável (renderizado 100% pelo React, sem manipular o DOM na mão).
-- Os grifos salvos com o esquema antigo não têm como ser convertidos com segurança
-- (offsets tinham outro significado), então a tabela é zerada.
TRUNCATE TABLE public.highlights;
ALTER TABLE public.highlights ADD COLUMN block_index integer NOT NULL DEFAULT 0;