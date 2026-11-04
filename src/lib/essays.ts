import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { delatex } from "@/lib/delatex";

/** Questões discursivas de um tópico e as respostas corrigidas pela IA. */

export type RubricItem = { item: string; points: number };

export type EssayQuestion = {
  id: string;
  topic_id: string;
  question: string;
  expected_answer: string;
  rubric: RubricItem[];
  subtopic: string | null;
  created_at: string;
};

export type EssayFeedback = {
  acertos: string[];
  faltou: string[];
  erros: string[];
  comentario: string;
};

export type EssayAnswer = {
  id: string;
  question_id: string;
  answer: string;
  score: number | null;
  feedback: EssayFeedback | null;
  created_at: string;
};

export const scoreFormat = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function useEssays(topicId: string) {
  return useQuery({
    queryKey: ["essays", topicId],
    queryFn: async () => {
      const [questions, answers] = await Promise.all([
        supabase
          .from("essay_questions")
          .select("id, topic_id, question, expected_answer, rubric, subtopic, created_at")
          .eq("topic_id", topicId)
          .order("created_at", { ascending: true }),
        supabase
          .from("essay_answers")
          .select("id, question_id, answer, score, feedback, created_at")
          .eq("topic_id", topicId)
          .order("created_at", { ascending: false }),
      ]);
      if (questions.error) throw questions.error;
      if (answers.error) throw answers.error;
      const byQuestion: Record<string, EssayAnswer[]> = {};
      for (const a of answers.data ?? []) {
        (byQuestion[a.question_id] ??= []).push({
          ...a,
          score: a.score === null ? null : Number(a.score),
          feedback: (a.feedback as EssayFeedback | null) ?? null,
        });
      }
      return {
        questions: (questions.data ?? []).map((q) => ({
          ...q,
          question: delatex(q.question),
          expected_answer: delatex(q.expected_answer),
          rubric: Array.isArray(q.rubric) ? (q.rubric as RubricItem[]) : [],
        })) as EssayQuestion[],
        // Mais recente primeiro
        answers: byQuestion,
      };
    },
  });
}
