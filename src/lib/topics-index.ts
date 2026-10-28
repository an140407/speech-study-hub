import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Dados compartilhados entre a Home e o índice da barra lateral.
 * As duas telas usam as mesmas chaves do React Query, então a busca acontece uma vez só.
 */

export type TopicListItem = { id: string; title: string; created_at: string };
export type TopicProgress = {
  fcTotal: number;
  fcSeen: number;
  mcTotal: number;
  mcSeen: number;
  exams: number;
};
export type ProgressData = {
  byTopic: Record<string, TopicProgress>;
  totals: { fcTotal: number; fcSeen: number; mcTotal: number; mcSeen: number; exams: number };
};

export function useTopicsList() {
  return useQuery({
    queryKey: ["topics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("id, title, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TopicListItem[];
    },
  });
}

export function useTopicsProgress() {
  return useQuery({
    queryKey: ["topics-progress"],
    queryFn: async (): Promise<ProgressData> => {
      const [fc, mc, exams] = await Promise.all([
        supabase.from("flashcards").select("topic_id, seen_at"),
        supabase.from("mcq_questions").select("id, topic_id, seen_at"),
        supabase.from("exam_attempts").select("question_ids"),
      ]);
      const byTopic: Record<string, TopicProgress> = {};
      const totals = { fcTotal: 0, fcSeen: 0, mcTotal: 0, mcSeen: 0, exams: 0 };
      const get = (t: string) =>
        (byTopic[t] ??= { fcTotal: 0, fcSeen: 0, mcTotal: 0, mcSeen: 0, exams: 0 });
      for (const f of fc.data ?? []) {
        const e = get(f.topic_id);
        e.fcTotal++;
        totals.fcTotal++;
        if (f.seen_at) {
          e.fcSeen++;
          totals.fcSeen++;
        }
      }
      const topicOfQuestion: Record<string, string> = {};
      for (const m of mc.data ?? []) {
        topicOfQuestion[m.id] = m.topic_id;
        const e = get(m.topic_id);
        e.mcTotal++;
        totals.mcTotal++;
        if (m.seen_at) {
          e.mcSeen++;
          totals.mcSeen++;
        }
      }
      for (const a of exams.data ?? []) {
        const ids = (a.question_ids as unknown as string[]) ?? [];
        if (!ids.length) continue;
        totals.exams++;
        // prova de um tópico só conta para aquele tópico
        const topicsOf = new Set(ids.map((qid) => topicOfQuestion[qid]));
        if (topicsOf.size === 1) {
          const only = [...topicsOf][0];
          if (only) get(only).exams++;
        }
      }
      return { byTopic, totals };
    },
  });
}

/** % de flashcards + questões já vistos de um tópico. */
export function progressPct(p: TopicProgress | undefined) {
  if (!p) return 0;
  const total = p.fcTotal + p.mcTotal;
  return total ? Math.round(((p.fcSeen + p.mcSeen) * 100) / total) : 0;
}

/**
 * Título para exibir: tira emojis e transforma listas numeradas ("… 2. Acústica 3. Cóclea")
 * em separadores. Não altera o que está salvo no banco.
 */
export function cleanTitle(title: string) {
  return title
    .replace(/\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|\u{20E3}/gu, "")
    .replace(/\s+\d{1,2}\.\s+/g, " · ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s·]+|[\s·]+$/g, "")
    .trim();
}

export function shortDate(iso: string) {
  return new Date(iso)
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    .replace(" de ", " ")
    .replace(".", "");
}