import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Attempt } from "@/lib/attempts";

/**
 * Dados extras das estatísticas: ramo de cada questão, provas e discursivas corrigidas.
 * As respostas das objetivas vêm de useAttempts (mesma consulta do Caderno de erros).
 */

export type ExamRow = { id: string; score: number; total: number; created_at: string };
export type EssayScore = { question_id: string; topic_id: string; score: number; created_at: string; subtopic: string | null };

export function useStatsData() {
  return useQuery({
    queryKey: ["stats-extra"],
    queryFn: async () => {
      const [mcq, exams, essays, essayQs] = await Promise.all([
        supabase.from("mcq_questions").select("id, subtopic"),
        supabase.from("exam_attempts").select("id, score, total, created_at").order("created_at"),
        supabase.from("essay_answers").select("question_id, topic_id, score, created_at").order("created_at"),
        supabase.from("essay_questions").select("id, subtopic"),
      ]);
      if (mcq.error) throw mcq.error;
      const subtopicOf: Record<string, string | null> = {};
      for (const q of mcq.data ?? []) subtopicOf[q.id] = q.subtopic;
      const essaySub: Record<string, string | null> = {};
      for (const q of essayQs.data ?? []) essaySub[q.id] = q.subtopic;
      return {
        subtopicOf,
        // Provas e discursivas são opcionais: se falharem, as objetivas ainda aparecem.
        exams: ((exams.data ?? []) as ExamRow[]).filter((e) => e.total > 0),
        essays: (essays.data ?? [])
          .filter((e) => e.score !== null)
          .map((e) => ({
            question_id: e.question_id,
            topic_id: e.topic_id,
            score: Number(e.score),
            created_at: e.created_at,
            subtopic: essaySub[e.question_id] ?? null,
          })) as EssayScore[],
      };
    },
  });
}

export type Period = "7" | "30" | "tudo";

export function periodStart(period: Period): number {
  if (period === "tudo") return 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (Number(period) - 1));
  return d.getTime();
}

const dayKey = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const weekKey = (t: number) => {
  const d = new Date(dayKey(t));
  const dow = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
};

/** Acerto ao longo do tempo: por dia nos últimos 7 dias, por semana nos outros períodos. */
export function accuracySeries(attempts: Attempt[], period: Period) {
  const byDay = period === "7";
  const key = byDay ? dayKey : weekKey;
  const buckets = new Map<number, { ok: number; n: number }>();
  for (const a of attempts) {
    const k = key(new Date(a.created_at).getTime());
    const b = buckets.get(k) ?? { ok: 0, n: 0 };
    b.n++;
    if (a.is_correct) b.ok++;
    buckets.set(k, b);
  }
  // Preenche os dias/semanas sem atividade para o eixo do tempo não "pular".
  const keys = [...buckets.keys()].sort((x, y) => x - y);
  if (!keys.length) return [];
  const start = period === "tudo" ? keys[0]! : key(periodStart(period));
  const end = key(Date.now());
  const step = (t: number) => {
    const d = new Date(t);
    d.setDate(d.getDate() + (byDay ? 1 : 7));
    return d.getTime();
  };
  const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  const out: { label: string; pct: number | null; ok: number; n: number }[] = [];
  for (let t = start; t <= end; t = step(t)) {
    const b = buckets.get(t);
    out.push({
      label: (byDay ? "" : "sem. ") + fmt.format(new Date(t)).replace(".", ""),
      pct: b ? Math.round((b.ok / b.n) * 100) : null,
      ok: b?.ok ?? 0,
      n: b?.n ?? 0,
    });
  }
  return out.slice(-16);
}
