import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clock, Minus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateMoreMcq } from "@/lib/study-extra.functions";
import type { McqRow } from "@/lib/study-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { delatex } from "@/lib/delatex";
import { cleanTitle, useTopicsList } from "@/lib/topics-index";

export const Route = createFileRoute("/_authenticated/prova")({
  head: () => ({
    meta: [
      { title: "Modo Prova — FonoLab" },
      {
        name: "description",
        content:
          "Monte uma prova com questões dos tópicos que você estudou e veja sua nota com gabarito comentado.",
      },
      { property: "og:title", content: "Modo Prova — FonoLab" },
      {
        property: "og:description",
        content: "Simule uma prova de Fonoaudiologia com questões dos seus tópicos.",
      },
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

  const topics = useTopicsList();
  const [confirmExit, setConfirmExit] = useState(false);
  const [onlyWrong, setOnlyWrong] = useState(false);

  async function startExam() {
    if (selected.length === 0) {
      toast.error("Escolha pelo menos um tópico.");
      return;
    }
    setBuilding(true);
    try {
      const fetchPool = async () => {
        const { data, error } = await supabase
          .from("mcq_questions")
          .select(
            "id, topic_id, question, options, correct_index, explanation, subtopic, ai_explanation, seen_at",
          )
          .in("topic_id", selected);
        if (error) throw error;
        return ((data ?? []) as unknown as McqRow[]).map((q) => ({
          ...q,
          question: delatex(q.question),
          options: (q.options ?? []).map((o) => delatex(o)),
          explanation: q.explanation ? delatex(q.explanation) : q.explanation,
        }));
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
          toast.info(
            `Não foi possível gerar todas as questões novas (limite do tópico) — ${extra.length} já praticada(s) foram incluídas pra completar.`,
          );
        }
      }

      if (!picked.length) {
        toast.error("Não há questões para os tópicos escolhidos.");
        return;
      }
      if (picked.length < size) {
        toast.info(
          `Só há ${picked.length} questões disponíveis nesses tópicos — a prova terá ${picked.length} questões.`,
        );
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
    const score = questions.reduce(
      (acc, q, i) => acc + (answers[i] === q.correct_index ? 1 : 0),
      0,
    );
    setStage("result");
    setOnlyWrong(false);
    window.scrollTo(0, 0);
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

  // Atalhos na prova: 1–4 (ou A–D) marcam, ← → navegam
  useEffect(() => {
    if (stage !== "running") return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (t?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      const k = e.key.toLowerCase();
      const map: Record<string, number> = {
        "1": 0,
        "2": 1,
        "3": 2,
        "4": 3,
        a: 0,
        b: 1,
        c: 2,
        d: 3,
      };
      if (k in map && map[k]! < (questions[current]?.options.length ?? 0)) {
        e.preventDefault();
        setAnswers((a) => a.map((v, idx) => (idx === current ? map[k]! : v)));
      } else if (k === "arrowright" && current < questions.length - 1) {
        e.preventDefault();
        setCurrent((c) => c + 1);
      } else if (k === "arrowleft" && current > 0) {
        e.preventDefault();
        setCurrent((c) => c - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, current, questions]);

  const allIds = (topics.data ?? []).map((t) => t.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));

  function leaveExam() {
    setConfirmExit(false);
    setStage("setup");
    setQuestions([]);
  }

  function exitExam() {
    // Com respostas marcadas, pede confirmação antes de descartar
    if (answers.some((a) => a !== null)) setConfirmExit(true);
    else leaveExam();
  }

  const answeredCount = answers.filter((a) => a !== null).length;
  const eyebrow = "text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground";

  return (
    <main className="mx-auto w-full max-w-[880px] px-5 pb-24 pt-8 sm:px-8 lg:pt-14">
      <p className={eyebrow}>Simulado</p>
      <h1
        className={cn(
          "mt-3 tracking-[-0.02em] transition-[font-size] duration-300",
          stage === "setup"
            ? "text-[2.6rem] leading-[1.02] sm:text-6xl"
            : "text-[1.75rem] leading-none",
        )}
      >
        Modo Prova
      </h1>

      {stage === "setup" && (
        <div className="animate-fade-up">
          <p className="mt-4 max-w-[60ch] text-muted-foreground">
            Monte uma prova com questões dos seus tópicos. As que você ainda não viu entram
            primeiro; se faltar, a IA gera novas.
          </p>

          <section aria-labelledby="prova-topicos" className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-[1.5px] border-foreground pb-2">
              <h2 id="prova-topicos" className="text-[1.75rem] leading-none">
                <span className="mr-2 font-mono text-base text-muted-foreground">01</span>Escolha os
                tópicos
              </h2>
              {!!allIds.length && (
                <button
                  type="button"
                  onClick={() => setSelected(allSelected ? [] : allIds)}
                  className="rounded-sm text-sm text-foreground/80 underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground"
                >
                  {allSelected ? "Limpar seleção" : "Selecionar todos"}
                </button>
              )}
            </div>
            {topics.isLoading ? (
              <div className="mt-4 space-y-3" aria-hidden>
                {[70, 55, 80].map((w, i) => (
                  <div key={i} className="h-5 rounded bg-black/[0.06]" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : !topics.data?.length ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Você ainda não gerou nenhum tópico.
              </p>
            ) : (
              <ul className="grid sm:grid-cols-2 sm:gap-x-8">
                {topics.data.map((t) => {
                  const checked = selected.includes(t.id);
                  return (
                    <li key={t.id} className="border-b border-border">
                      <label className="flex min-h-12 cursor-pointer items-center gap-3 py-2.5 text-[0.95rem]">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            setSelected((s) => (v ? [...s, t.id] : s.filter((id) => id !== t.id)))
                          }
                        />
                        <span
                          className={cn(
                            "leading-snug",
                            checked ? "text-foreground" : "text-foreground/80",
                          )}
                        >
                          {cleanTitle(t.title)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground tnum">
              {selected.length} {selected.length === 1 ? "tópico escolhido" : "tópicos escolhidos"}
            </p>
          </section>

          <section aria-labelledby="prova-qtd" className="mt-10">
            <h2
              id="prova-qtd"
              className="border-b-[1.5px] border-foreground pb-2 text-[1.75rem] leading-none"
            >
              <span className="mr-2 font-mono text-base text-muted-foreground">02</span>Quantidade
              de questões
            </h2>
            <div
              role="group"
              aria-label="Quantidade de questões"
              className="mt-4 inline-flex flex-wrap rounded-lg border border-border bg-card p-1"
            >
              {SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSize(n)}
                  aria-pressed={size === n}
                  className={cn(
                    "h-10 min-w-14 rounded-md px-4 text-sm font-medium tnum transition-colors",
                    size === n
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </section>

          <Button
            className="mt-10 h-12 px-6 text-[0.95rem]"
            onClick={startExam}
            disabled={building}
          >
            {building ? "Montando a prova…" : "Iniciar prova"}{" "}
            {!building && <ArrowRight className="size-4" aria-hidden />}
          </Button>
        </div>
      )}

      {stage === "running" && questions[current] && (
        <div className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className={eyebrow + " tnum"}>
              Questão {current + 1} de {questions.length}
            </span>
            <div className="flex items-center gap-4">
              <span
                className={cn(
                  "flex items-center gap-1.5 font-mono tnum",
                  (seconds[current] ?? 0) >= SLOW_SECONDS && "text-destructive",
                )}
                title="Tempo nesta questão"
              >
                <Clock className="size-3.5" aria-hidden /> {fmt(seconds[current] ?? 0)}
              </span>
              <span className="font-mono tnum" title="Tempo total">
                Total {fmt(totalSeconds)}
              </span>
              <span className="tnum">
                {answeredCount} {answeredCount === 1 ? "respondida" : "respondidas"}
              </span>
              <Button variant="ghost" size="sm" className="h-9" onClick={exitExam}>
                <X className="size-4" aria-hidden /> Sair<span className="sr-only"> da prova</span>
              </Button>
            </div>
          </div>
          <div
            role="progressbar"
            aria-label="Progresso na prova"
            aria-valuemin={1}
            aria-valuemax={questions.length}
            aria-valuenow={current + 1}
            className="mt-3 h-1 w-full overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-300"
              style={{ width: `${((current + 1) / questions.length) * 100}%` }}
            />
          </div>

          <div key={current} className="animate-fade-up">
            <h2 className="mt-8 text-[1.65rem] leading-[1.18] sm:text-[1.9rem]">
              {questions[current].question}
            </h2>
            <ol className="mt-6 space-y-2.5" aria-label="Alternativas">
              {questions[current].options.map((opt, i) => {
                const chosen = answers[current] === i;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      aria-pressed={chosen}
                      onClick={() =>
                        setAnswers((a) => a.map((v, idx) => (idx === current ? i : v)))
                      }
                      className={cn(
                        "flex min-h-14 w-full items-center gap-3.5 rounded-lg border px-4 py-3 text-left text-[0.98rem] leading-snug transition-[background-color,border-color,transform] duration-150 active:scale-[0.99]",
                        chosen
                          ? "border-foreground bg-card shadow-[0_0_0_1px_var(--color-foreground)]"
                          : "border-border bg-card hover:border-foreground/30",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full border text-[0.8125rem] font-semibold",
                          chosen
                            ? "border-transparent bg-foreground text-background"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {LETTERS[i]}
                      </span>
                      <span>{opt}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="mt-6 flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => setCurrent((c) => c - 1)}
              disabled={current === 0}
            >
              <ArrowLeft className="size-4" aria-hidden /> Anterior
            </Button>
            {current < questions.length - 1 ? (
              <Button onClick={() => setCurrent((c) => c + 1)}>
                Próxima <ArrowRight className="size-4" aria-hidden />
              </Button>
            ) : (
              <Button onClick={finishExam}>
                <Check className="size-4" aria-hidden /> Finalizar prova
              </Button>
            )}
          </div>

          <ol
            className="mt-8 flex flex-wrap gap-2 border-t border-border pt-5"
            aria-label="Ir para a questão"
          >
            {questions.map((_, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setCurrent(i)}
                  aria-current={i === current ? "true" : undefined}
                  aria-label={`Questão ${i + 1}${answers[i] !== null ? ", respondida" : ""}`}
                  className={cn(
                    "size-10 rounded-md border text-sm tnum transition-colors",
                    i === current
                      ? "border-foreground bg-foreground text-background"
                      : answers[i] !== null
                        ? "border-border bg-accent text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-foreground/30",
                  )}
                >
                  {i + 1}
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-4 hidden items-center gap-3 text-xs text-muted-foreground md:flex">
            <span className="flex items-center gap-1.5">
              <kbd>1</kbd>–<kbd>4</kbd> marcar
            </span>
            <span className="flex items-center gap-1.5">
              <kbd>←</kbd>
              <kbd>→</kbd> navegar
            </span>
          </p>
        </div>
      )}

      {stage === "result" && (
        <div className="mt-8 animate-fade-up space-y-10">
          <section
            aria-label="Nota final"
            className="flex flex-wrap items-end justify-between gap-6 border-y border-border py-6"
          >
            <div>
              <p className={eyebrow}>Nota final</p>
              <p className="mt-2 font-serif text-7xl leading-none tnum">
                {score}
                <span className="text-3xl text-muted-foreground">/{questions.length}</span>
              </p>
              <p className="mt-3 text-sm text-muted-foreground tnum">
                {Math.round((score / questions.length) * 100)}% de acertos · tempo total{" "}
                {fmt(totalSeconds)}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setStage("setup");
                setQuestions([]);
              }}
            >
              <RotateCcw className="size-4" aria-hidden /> Nova prova
            </Button>
          </section>

          {bySubtopic.length > 0 && (
            <section aria-labelledby="prova-ramos">
              <h2 id="prova-ramos" className="text-[1.75rem] leading-none">
                Desempenho por ramo
              </h2>
              <ul className="mt-4 space-y-3">
                {bySubtopic
                  .slice()
                  .sort((a, b) => a.pct - b.pct)
                  .map((r) => (
                    <li
                      key={r.subtopic}
                      className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-4 text-sm"
                    >
                      <span className="truncate" title={r.subtopic}>
                        {r.subtopic}
                      </span>
                      <span aria-hidden className="h-2 overflow-hidden rounded-full bg-border">
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            r.pct >= 70
                              ? "bg-tint-1-fg"
                              : r.pct >= 40
                                ? "bg-tint-4-fg"
                                : "bg-tint-3-fg",
                          )}
                          style={{ width: `${Math.max(r.pct, 2)}%` }}
                        />
                      </span>
                      <span className="w-20 text-right tnum">
                        {r.label} · {r.pct}%
                      </span>
                    </li>
                  ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Os ramos com menos acertos aparecem primeiro.
              </p>
            </section>
          )}

          <section aria-labelledby="prova-gabarito">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="prova-gabarito" className="text-[1.75rem] leading-none">
                Gabarito comentado
              </h2>
              {score < questions.length && (
                <div
                  role="group"
                  aria-label="Mostrar no gabarito"
                  className="inline-flex rounded-lg border border-border bg-card p-1 text-sm"
                >
                  {[
                    { v: false, label: `Todas (${questions.length})` },
                    { v: true, label: `Só as que errei (${questions.length - score})` },
                  ].map((o) => (
                    <button
                      key={String(o.v)}
                      type="button"
                      aria-pressed={onlyWrong === o.v}
                      onClick={() => setOnlyWrong(o.v)}
                      className={cn(
                        "h-9 rounded-md px-3 tnum transition-colors",
                        onlyWrong === o.v
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <ol className="mt-4 divide-y divide-border border-y border-border">
              {questions.map((q, i) => {
                const ok = answers[i] === q.correct_index;
                const blank = answers[i] === null;
                if (onlyWrong && ok) return null;
                return (
                  <li key={q.id} className="py-5">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                          ok
                            ? "bg-tint-1-fg text-white"
                            : blank
                              ? "bg-muted-foreground text-white"
                              : "bg-tint-3-fg text-white",
                        )}
                        aria-hidden
                      >
                        {ok ? (
                          <Check className="size-3.5" strokeWidth={3} />
                        ) : blank ? (
                          <Minus className="size-3.5" strokeWidth={3} />
                        ) : (
                          <X className="size-3.5" strokeWidth={3} />
                        )}
                      </span>
                      <p className="flex-1 font-medium leading-relaxed">
                        <span className="sr-only">
                          {ok ? "Certa. " : blank ? "Não respondida. " : "Errada. "}
                        </span>
                        {i + 1}. {q.question}
                      </p>
                      <span
                        className={cn(
                          "shrink-0 font-mono text-xs text-muted-foreground tnum",
                          (seconds[i] ?? 0) >= SLOW_SECONDS && "text-destructive",
                        )}
                      >
                        {fmt(seconds[i] ?? 0)}
                      </span>
                    </div>
                    <ul className="mt-3 space-y-1.5 pl-9 text-sm">
                      {q.options.map((opt, j) => (
                        <li
                          key={j}
                          className={cn(
                            "rounded-md border px-3 py-2",
                            j === q.correct_index
                              ? "border-tint-1-fg/30 bg-tint-1"
                              : answers[i] === j
                                ? "border-tint-3-fg/30 bg-tint-3"
                                : "border-border bg-card",
                          )}
                        >
                          <span className="mr-2 font-semibold">{LETTERS[j]}.</span>
                          {opt}
                          {j === q.correct_index && (
                            <span className="ml-2 text-xs font-semibold text-tint-1-fg">
                              Correta
                            </span>
                          )}
                          {answers[i] === j && j !== q.correct_index && (
                            <span className="ml-2 text-xs font-semibold text-tint-3-fg">
                              Sua resposta
                            </span>
                          )}
                          {blank && j === q.correct_index && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              (não respondida)
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {q.explanation && (
                      <p className="ml-9 mt-3 rounded-md bg-tint-4 px-3 py-2.5 text-sm leading-relaxed">
                        <strong className="font-semibold">Por quê? </strong>
                        {q.explanation}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      )}
      <AlertDialog open={confirmExit} onOpenChange={setConfirmExit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl">Sair da prova?</AlertDialogTitle>
            <AlertDialogDescription>
              Você já respondeu {answeredCount} de {questions.length} questões. Sair agora descarta
              esta prova.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar a prova</AlertDialogCancel>
            <AlertDialogAction onClick={leaveExam}>Sair e descartar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}