import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { McqRow } from "@/lib/study-types";

/**
 * Registro de cada resposta de questão objetiva (prática, prova e caderno de erros).
 * O banco calcula sozinho se acertou e de qual tópico é a questão.
 *
 * Caderno de erros: uma questão entra quando você erra e sai depois de
 * RESOLVE_STREAK acertos seguidos depois do último erro.
 */

export type AttemptSource = "pratica" | "prova" | "erros";

export type Attempt = {
  id: string;
  question_id: string;
  topic_id: string;
  chosen_index: number;
  is_correct: boolean;
  source: AttemptSource;
  exam_attempt_id: string | null;
  created_at: string;
};

export const RESOLVE_STREAK = 2;

export async function recordAttempts(
  rows: { question_id: string; chosen_index: number; source: AttemptSource; exam_attempt_id?: string | null }[],
) {
  if (!rows.length) return;
  const { error } = await supabase.from("mcq_attempts").insert(
    rows.map((r) => ({
      question_id: r.question_id,
      chosen_index: r.chosen_index,
      source: r.source,
      exam_attempt_id: r.exam_attempt_id ?? null,
    })),
  );
  // Registrar a resposta nunca pode atrapalhar o estudo: só avisa no console.
  if (error) console.error("Falha ao registrar resposta", error);
}

const PAGE = 1000;

export function useAttempts() {
  return useQuery({
    queryKey: ["mcq-attempts"],
    queryFn: async () => {
      const all: Attempt[] = [];
      // O Supabase devolve no máximo 1000 linhas por vez: busca em páginas.
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("mcq_attempts")
          .select("id, question_id, topic_id, chosen_index, is_correct, source, exam_attempt_id, created_at")
          .order("created_at", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        all.push(...((data ?? []) as Attempt[]));
        if (!data || data.length < PAGE) break;
      }
      return all;
    },
  });
}

export type Mistake = {
  questionId: string;
  topicId: string;
  wrongCount: number;
  lastWrongAt: string;
  /** Acertos seguidos desde o último erro (sai do caderno ao chegar em RESOLVE_STREAK). */
  streak: number;
  /** Última alternativa escolhida errada. */
  lastWrongChoice: number;
};

/** Percorre as respostas em ordem e devolve o que está pendente no caderno de erros. */
export function computeMistakes(attempts: Attempt[]) {
  const byQuestion = new Map<string, Mistake & { pending: boolean }>();
  for (const a of attempts) {
    const m = byQuestion.get(a.question_id);
    if (!a.is_correct) {
      byQuestion.set(a.question_id, {
        questionId: a.question_id,
        topicId: a.topic_id,
        wrongCount: (m?.wrongCount ?? 0) + 1,
        lastWrongAt: a.created_at,
        lastWrongChoice: a.chosen_index,
        streak: 0,
        pending: true,
      });
    } else if (m?.pending) {
      m.streak += 1;
      if (m.streak >= RESOLVE_STREAK) m.pending = false;
    }
  }
  const all = [...byQuestion.values()];
  const pending = all
    .filter((m) => m.pending)
    .sort((a, b) => b.lastWrongAt.localeCompare(a.lastWrongAt));
  return { pending, resolved: all.length - pending.length };
}

/** Questões pendentes do caderno de erros + quais já viraram flashcard. */
export function useMistakeQuestions(ids: string[]) {
  return useQuery({
    queryKey: ["mistake-questions", [...ids].sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const questions: McqRow[] = [];
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await supabase
          .from("mcq_questions")
          .select(
            "id, topic_id, question, options, correct_index, explanation, subtopic, ai_explanation, seen_at",
          )
          .in("id", ids.slice(i, i + 150));
        if (error) throw error;
        questions.push(...((data ?? []) as unknown as McqRow[]));
      }
      const { data: cards } = await supabase
        .from("flashcards")
        .select("origin_mcq_id")
        .not("origin_mcq_id", "is", null);
      const withCard = new Set((cards ?? []).map((c) => c.origin_mcq_id as string));
      return { questions, withCard };
    },
  });
}
