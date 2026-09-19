import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BarChart3, CheckCircle2, Clock, GraduationCap, RotateCcw, X, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateMoreMcq } from "@/lib/study-extra.functions";
import type { McqRow } from "@/lib/study-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/prova")({
  head: () => ({
    meta: [
      { title: "Modo Prova — FonoLab" },
      { name: "description", content: "Monte uma prova com questões dos tópicos que você estudou e veja sua nota com gabarito comentado." },
      { property: "og:title", content: "Modo Prova — FonoLab" },
      { property: "og:description", content: "Simule uma prova de Fonoaudiologia com questões dos seus tópicos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExamPage,
});

const LETTERS = ["A", "B", "C", "D"];
const SIZES = [10, 20, 30, 40, 50];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

type Stage = "setup" | "running" | "result";

const SLOW_SECONDS = 180;

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}


function ExamPage() {
  const [stage, setStage] = useState<Stage>("setup");
  const [selected, setSelected] = useState<string[]>([]);
  const [size, setSize] = useState(10);
  const [questions, setQuestions] = useState<McqRow[]>([]);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [current, setCurrent] = useState(0);
  const [building, setBuilding] = useState(false);
  const [seconds, setSeconds] = useState<number[]>([]);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const generateMore = useServerFn(generateMoreMcq);

  // Cronômetro: conta o tempo na questão atual e o tempo total (sem limite).
  useEffect(() => {
    if (stage !== "running") return;
    const t = setInterval(() => {
      setTotalSeconds((v) => v + 1);
      setSeconds((arr) => arr.map((v, i) => (i === current ? v + 1 : v)));
    }, 1000);
    return () => clearInterval(t);
  }, [stage, current]);


  const topics = useQuery({
    queryKey: ["topics"],
    queryFn: async () => {
      const { data, error } = await supabase.from("topics").select("id, title, created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function startExam() {
    if (selected.length === 0) { toast.error("Escolha pelo menos um tópico."); return; }
    setBuilding(true);
    try {
      const fetchPool = async () => {
        const { data, error } = await supabase
          .from("mcq_questions")
          .select("id, topic_id, question, options, correct_index, explanation, subtopic, ai_explanation, seen_at")
          .in("topic_id", selected);
        if (error) throw error;
        return (data ?? []) as unknown as McqRow[];
      };

      let pool = await fetchPool();
      let unseen = pool.filter((q) => !q.seen_at);

      // Se não tem não-vistas suficientes, gera questões novas (evita repetir o que já foi praticado).
      if (unseen.length < size) {
        const needed = size - unseen.length;
        const countByTopic = new Map<string, number>();
        for (const q of pool) countByTopic.set(q.topic_id, (countByTopic.get(q.topic_id) ?? 0) + 1);

        let remaining = needed;
        const asks: { topic_id: string; count: number }[] = [];
        for (const topicId of selected) {
          if (remaining <= 0) break;
          const room = Math.max(0, 50 - (countByTopic.get(topicId) ?? 0));
          const take = Math.min(room, remaining, 20);
          if (take > 0) {
            asks.push({ topic_id: topicId, count: take });
            remaining -= take;
          }
        }

        if (asks.length) {
          toast.info(`Gerando ${needed - remaining} questões novas pra evitar repetir a prática…`);
          for (const a of asks) {
            try {
              await generateMore({ data: a });
            } catch (e) {
              console.error("Falha ao gerar questões extras pra prova", e);
            }
          }
          pool = await fetchPool();
          unseen = pool.filter((q) => !q.seen_at);
        }
      }

      let picked: McqRow[];
      if (unseen.length >= size) {
        picked = shuffle(unseen).slice(0, size);
      } else {
        const seenPool = pool.filter((q) => q.seen_at);
        const extra = shuffle(seenPool).slice(0, size - unseen.length);
        picked = shuffle([...unseen, ...extra]);
        if (extra.length > 0) {
          toast.info(`Não foi possível gerar todas as questões novas (limite do tópico) — ${extra.length} já praticada(s) foram incluídas pra completar.`);
        }
      }

      if (!picked.length) { toast.error("Não há questões para os tópicos escolhidos."); return; }
      if (picked.length < size) {
        toast.info(`Só há ${picked.length} questões disponíveis nesses tópicos — a prova terá ${picked.length} questões.`);
      }

      setQuestions(picked);
      setAnswers(picked.map(() => null));
      setSeconds(picked.map(() => 0));
      setTotalSeconds(0);
      setCurrent(0);
      setStage("running");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao montar a prova.");
    } finally {
      setBuilding(false);
    }
  }

  async function finishExam() {
    const score = questions.reduce((acc, q, i) => acc + (answers[i] === q.correct_index ? 1 : 0), 0);
    setStage("result");
    const { error } = await supabase.from("exam_attempts").insert({
      question_ids: questions.map((q) => q.id),
      answers,
      score,
      total: questions.length,
      question_seconds: seconds,
      total_seconds: totalSeconds,
    });
    if (error) console.error(error);
  }

  const bySubtopic = (() => {
    const map: Record<string, { total: number; ok: number }> = {};
    questions.forEach((q, i) => {
      const key = q.subtopic?.trim() || "Sem sub-tópico";
      const e = (map[key] ??= { total: 0, ok: 0 });
      e.total++;
      if (answers[i] === q.correct_index) e.ok++;
    });
    return Object.entries(map).map(([subtopic, v]) => ({
      subtopic,
      pct: Math.round((v.ok / v.total) * 100),
      label: `${v.ok}/${v.total}`,
    }));
  })();

  const score = questions.reduce((acc, q, i) => acc + (answers[i] === q.correct_index ? 1 : 0), 0);

  function exitExam() {
    const answered = answers.filter((a) => a !== null).length;
    if (answered > 0 && !confirm("Sair agora descarta essa prova em andamento. Tem certeza?")) return;
    setStage("setup");
    setQuestions([]);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-8">
      <div className="mb-6 flex items-center gap-2">
        <GraduationCap className="size-6 text-primary" />
        <h1 className="text-3xl font-semibold">Modo Prova</h1>
      </div>

      {stage === "setup" && (
        <div className="card-soft animate-fade-up p-6">
          <h2 className="text-lg font-semibold">1. Escolha os tópicos</h2>
          {topics.isLoading ? (
            <div className="mt-3 h-20 animate-pulse rounded-lg bg-muted" />
          ) : !topics.data?.length ? (
            <p className="mt-3 text-sm text-muted-foreground">Você ainda não gerou nenhum tópico.</p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {topics.data.map((t) => {
                const checked = selected.includes(t.id);
                return (
                  <li key={t.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors",
                        checked ? "border-primary/50 bg-accent" : "border-border hover:bg-muted",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setSelected((s) => (v ? [...s, t.id] : s.filter((id) => id !== t.id)))
                        }
                      />
                      <span className="font-medium">{t.title}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <h2 className="mt-6 text-lg font-semibold">2. Quantidade de questões</h2>
          <div className="mt-3 flex gap-2">
            {SIZES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSize(n)}
                className={cn(
                  "h-11 flex-1 rounded-xl border text-sm font-medium transition-colors",
                  size === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                )}
              >
                {n}
              </button>
            ))}
          </div>

          <Button className="mt-6 h-12 w-full rounded-xl" size="lg" onClick={startExam} disabled={building}>
            {building ? "Montando prova…" : "Iniciar prova"}
          </Button>
        </div>
      )}

      {stage === "running" && questions[current] && (
        <div className="card-soft animate-fade-up p-6" key={current}>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Questão {current + 1} de {questions.length}</span>
            <div className="flex items-center gap-3">
              <span className={cn("flex items-center gap-1 font-medium tabular-nums", (seconds[current] ?? 0) >= SLOW_SECONDS && "text-destructive")}>
                <Clock className="size-3.5" /> {fmt(seconds[current] ?? 0)}
              </span>
              <span className="tabular-nums">Total {fmt(totalSeconds)}</span>
              <span>{answers.filter((a) => a !== null).length} respondidas</span>
              <button type="button" onClick={exitExam} className="flex items-center gap-1 text-muted-foreground hover:text-destructive">
                <X className="size-3.5" /> Sair
              </button>
            </div>
          </div>
          <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
          </div>
          <p className="text-lg font-medium leading-relaxed">{questions[current].question}</p>
          <div className="mt-4 grid gap-2">
            {questions[current].options.map((opt, i) => {
              const chosen = answers[current] === i;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAnswers((a) => a.map((v, idx) => (idx === current ? i : v)))}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors",
                    chosen ? "border-primary bg-accent" : "border-border hover:bg-muted",
                  )}
                >
                  <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", chosen ? "bg-primary text-primary-foreground" : "bg-muted")}>{LETTERS[i]}</span>
                  <span className="pt-1">{opt}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex items-center justify-between gap-2">
            <Button variant="outline" onClick={() => setCurrent((c) => c - 1)} disabled={current === 0}>
              <ArrowLeft className="size-4" /> Anterior
            </Button>
            {current < questions.length - 1 ? (
              <Button onClick={() => setCurrent((c) => c + 1)}>
                Próxima <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button onClick={finishExam} className="bg-success text-success-foreground hover:bg-success/90">
                Finalizar prova
              </Button>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {questions.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrent(i)}
                className={cn(
                  "size-8 rounded-lg border text-xs font-medium",
                  i === current ? "border-primary bg-primary text-primary-foreground" : answers[i] !== null ? "border-border bg-accent" : "border-border bg-card",
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {stage === "result" && (
        <div className="animate-fade-up space-y-4">
          <div className="card-soft p-8 text-center">
            <p className="text-sm uppercase tracking-wide text-muted-foreground">Nota final</p>
            <p className="mt-2 font-serif text-6xl font-semibold text-primary">
              {score}<span className="text-2xl text-muted-foreground">/{questions.length}</span>
            </p>
            <p className="mt-2 text-muted-foreground">
              {Math.round((score / questions.length) * 100)}% de acertos · tempo total {fmt(totalSeconds)}
            </p>
            <Button variant="outline" className="mt-5" onClick={() => { setStage("setup"); setQuestions([]); }}>
              <RotateCcw className="size-4" /> Nova prova
            </Button>
          </div>

          {bySubtopic.length > 0 && (
            <div className="card-soft p-5">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="size-5 text-primary" />
                <h2 className="text-lg font-semibold">Desempenho por sub-tópico</h2>
              </div>
              <div className="w-full" style={{ height: Math.max(220, bySubtopic.length * 48) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bySubtopic} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <YAxis type="category" dataKey="subtopic" tick={{ fontSize: 12 }} width={150} />
                    <Tooltip formatter={(v: number, _n, p) => [`${v}% (${p.payload.label})`, "Acertos"]} />
                    <Bar dataKey="pct" radius={[0, 6, 6, 0]} barSize={22}>
                      {bySubtopic.map((d, i) => (
                        <Cell key={i} fill={`var(--branch-${(i % 6) + 1})`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {questions.map((q, i) => {
            const ok = answers[i] === q.correct_index;
            return (
              <div key={q.id} className="card-soft p-5">
                <div className="flex items-start gap-2">
                  {ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />}
                  <p className="flex-1 font-medium">{i + 1}. {q.question}</p>
                  <span className={cn("shrink-0 text-xs tabular-nums text-muted-foreground", (seconds[i] ?? 0) >= SLOW_SECONDS && "text-destructive")}>
                    {fmt(seconds[i] ?? 0)}
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {q.options.map((opt, j) => (
                    <li
                      key={j}
                      className={cn(
                        "rounded-lg border px-3 py-2",
                        j === q.correct_index ? "border-success/50 bg-success/10" : answers[i] === j ? "border-destructive/50 bg-destructive/10" : "border-border",
                      )}
                    >
                      <span className="mr-2 font-semibold">{LETTERS[j]}.</span>{opt}
                      {j === q.correct_index && <span className="ml-2 text-xs font-medium text-success">Correta</span>}
                      {answers[i] === j && j !== q.correct_index && <span className="ml-2 text-xs font-medium text-destructive">Sua resposta</span>}
                      {answers[i] === null && j === q.correct_index && <span className="ml-2 text-xs text-muted-foreground">(não respondida)</span>}
                    </li>
                  ))}
                </ul>
                {q.explanation && <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground"><strong className="text-foreground">Explicação: </strong>{q.explanation}</p>}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}