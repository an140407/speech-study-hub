import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { askJson, PROFESSOR } from "./ai.server";

const LETTERS = "ABCD";

/**
 * Caderno de erros: transforma uma questão errada num flashcard curto e autossuficiente
 * (a vinheta inteira não cabe na frente de um cartão). Se a questão já virou cartão,
 * devolve o existente em vez de criar outro.
 */
export const flashcardFromMistake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ mcq_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: q, error } = await context.supabase
      .from("mcq_questions")
      .select("id, topic_id, question, options, correct_index, explanation, subtopic")
      .eq("id", data.mcq_id)
      .single();
    if (error || !q) throw new Error("Questão não encontrada.");

    const { data: existing } = await context.supabase
      .from("flashcards")
      .select("id")
      .eq("origin_mcq_id", q.id)
      .limit(1)
      .maybeSingle();
    if (existing) return { id: existing.id as string, created: false };

    const options = (q.options ?? []) as string[];
    const result = await askJson<{ front?: string; back?: string }>(
      `${PROFESSOR}
Transforme uma questão de múltipla escolha que o aluno ERROU em UM flashcard de revisão.
- "front": pergunta direta e autossuficiente, com no máximo 25 palavras, sobre o conceito que a questão cobra. Não copie a vinheta: traga só o dado clínico essencial, se precisar.
- "back": a resposta correta em 1 a 3 frases curtas, com o porquê.
Responda SOMENTE com JSON: { "front": "string", "back": "string" }`,
      `Questão: ${q.question}
Alternativas: ${options.map((o, i) => `${LETTERS[i]}) ${o}`).join(" | ")}
Correta: ${LETTERS[q.correct_index]}) ${options[q.correct_index] ?? ""}
Explicação: ${q.explanation || "—"}`,
    );
    const front = String(result.front ?? "").trim();
    const back = String(result.back ?? "").trim();
    if (!front || !back) throw new Error("A IA não devolveu um flashcard válido. Tente de novo.");

    const { data: card, error: insertError } = await context.supabase
      .from("flashcards")
      .insert({ topic_id: q.topic_id, front, back, subtopic: q.subtopic, origin_mcq_id: q.id })
      .select("id")
      .single();
    if (insertError || !card) throw new Error(insertError?.message ?? "Não deu para salvar o flashcard.");
    return { id: card.id as string, created: true };
  });
