import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Layers, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { QuestionStem } from "@/components/study/QuestionStem";
import { AiWait } from "@/components/study/AiWait";
import { cn } from "@/lib/utils";
import { delatex } from "@/lib/delatex";
import { splitVignette } from "@/lib/vignette";
import { aiErrorMessage, aiRetryLabel, withAiRetry } from "@/lib/ai-busy";
import { cleanTitle, useTopicsList } from "@/lib/topics-index";
import {
  computeMistakes,
  recordAttempts,
  RESOLVE_STREAK,
  useAttempts,
  useMistakeQuestions,
  type Mistake,
} from "@/lib/attempts";
import { flashcardFromMistake } from "@/lib/mistakes.functions";
import type { McqRow } from "@/lib/study-types";

export const Route = createFileRoute("/_authenticated/erros")({
  head: () => ({
    meta: [
      { title: "Caderno de erros — FonoLab" },
      {
        name: "description",
        content: "As questões que você errou, para revisar até acertar duas vezes seguidas.",
      },
    ],
  }),
  component: ErrosPage,
});

const LETTERS = ["A", "B", "C", "D"];
const eyebrow =
  "font-sans text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground";

type Item = { mistake: Mistake; question: McqRow };

function relative(iso: string) {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  return new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" }).format(-days, "day");
}

function ErrosPage() {
  const attempts = useAttempts();
  const topics = useTopicsList();
  const { pending, resolved } = useMemo(
    () => computeMistakes(attempts.data ?? []),
    [attempts.data],
  );
  const ids = useMemo(() => pending.map((m) => m.questionId), [pending]);
  const questions = useMistakeQuestions(ids);
  const [topicFilter, setTopicFilter] = useState("todos");
  const [session, setSession] = useState<Item[] | null>(null);

  const topicTitle = (id: string) =>
    cleanTitle(topics.data?.find((t) => t.id === id)?.title ?? "Tópico");

  const items: Item[] = useMemo(() => {
    const byId = new Map((questions.data?.questions ?? []).map((q) => [q.id, q]));
    return pending.flatMap((m) => {
      const q = byId.get(m.questionId);
      if (!q) return [];
      return [
        {
          mistake: m,
          question: {
            ...q,
            question: delatex(q.question),
            options: (q.options ?? []).map((o) => delatex(o)),
            explanation: q.explanation ? delatex(q.explanation) : q.explanation,
          },
        },
      ];
    });
  }, [pending, questions.data]);

  const topicCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) map.set(it.question.topic_id, (map.get(it.question.topic_id) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const visible =
    topicFilter === "todos" ? items : items.filter((it) => it.question.topic_id === topicFilter);
  const loading = attempts.isLoading || (ids.length > 0 && questions.isLoading);

  if (session) {
    return (
      <PracticeSession
        items={session}
        withCard={questions.data?.withCard ?? new Set()}
        topicTitle={topicTitle}
        onExit={() => setSession(null)}
      />
    );
  }

  return (
    <main className="mx-auto w-full max-w-[960px] px-5 pb-24 pt-8 sm:px-8 lg:pt-12">
      <p className={eyebrow}>Revisão</p>
      <h1 className="mt-2 text-[2.6rem] leading-none tracking-[-0.02em] sm:text-6xl">
        Caderno de <i>erros</i>
      </h1>
      <p className="mt-4 max-w-[60ch] text-muted-foreground">
        Toda questão que você erra, na prática ou no Modo Prova, vem para cá. Ela sai depois de{" "}
        {RESOLVE_STREAK} acertos seguidos.
      </p>

      {loading ? (
        <div className="mt-10 space-y-4" aria-busy="true" aria-label="Carregando">
          {[80, 64, 72].map((w, i) => (
            <div
              key={i}
              className="h-5 animate-pulse rounded bg-foreground/[0.06]"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      ) : !items.length ? (
        <div className="mt-10 rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-serif text-2xl">
            {resolved > 0 ? "Nenhum erro pendente" : "Nenhum erro registrado ainda"}
          </p>
          <p className="mx-auto mt-2 max-w-[48ch] text-sm text-muted-foreground">
            {resolved > 0
              ? `${resolved} ${resolved === 1 ? "questão já saiu" : "questões já saíram"} do caderno. Continue praticando: o que você errar aparece aqui.`
              : "Responda questões na aba Questões de um tópico ou no Modo Prova. O que você errar aparece aqui."}
          </p>
        </div>
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-2 border-y border-border sm:max-w-md">
            <div className="py-4 pr-4">
              <dt className="sr-only">Pendentes</dt>
              <dd className="font-serif text-5xl leading-none tnum">{items.length}</dd>
              <dd className="mt-1 text-sm text-muted-foreground">para revisar</dd>
            </div>
            <div className="border-l border-border py-4 pl-4">
              <dt className="sr-only">Resolvidas</dt>
              <dd className="font-serif text-5xl leading-none tnum">{resolved}</dd>
              <dd className="mt-1 text-sm text-muted-foreground">já saíram</dd>
            </div>
          </dl>

          <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
            {topicCounts.length > 1 ? (
              <div role="group" aria-label="Filtrar por tópico" className="flex flex-wrap gap-1.5">
                {[["todos", items.length] as const, ...topicCounts].map(([id, n]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={topicFilter === id}
                    onClick={() => setTopicFilter(id)}
                    className={cn(
                      "h-8 max-w-[16rem] truncate rounded-md border px-3 text-[0.8125rem] transition-colors",
                      topicFilter === id
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    {id === "todos" ? "Todos" : topicTitle(id)}{" "}
                    <span className="tnum opacity-70">({n})</span>
                  </button>
                ))}
              </div>
            ) : (
              <span />
            )}
            <Button onClick={() => setSession(visible)}>
              Praticar {visible.length === 1 ? "este erro" : `estes ${visible.length} erros`}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>

          <ul className="mt-6 divide-y divide-border border-y border-border">
            {visible.map((it) => (
              <MistakeRow
                key={it.question.id}
                item={it}
                topic={topicTitle(it.question.topic_id)}
                hasCard={questions.data?.withCard.has(it.question.id) ?? false}
                onPractice={() => setSession([it])}
              />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

function MistakeRow({
  item,
  topic,
  hasCard,
  onPractice,
}: {
  item: Item;
  topic: string;
  hasCard: boolean;
  onPractice: () => void;
}) {
  const { mistake: m, question: q } = item;
  return (
    <li className="py-5">
      <p className={cn(eyebrow, "truncate")}>
        <Link
          to="/topico/$id"
          params={{ id: q.topic_id }}
          className="rounded-sm hover:text-foreground"
        >
          {topic}
        </Link>
        {q.subtopic ? ` · ${q.subtopic}` : ""}
      </p>
      <p className="mt-2 font-serif text-[1.35rem] leading-[1.2] [text-wrap:pretty]">
        {splitVignette(q.question).stem}
      </p>
      <p className="mt-2 text-xs text-muted-foreground tnum">
        Errou {m.wrongCount}× · última vez {relative(m.lastWrongAt)} · {m.streak}/{RESOLVE_STREAK}{" "}
        acertos para sair
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onPractice}>
          Praticar só esta
        </Button>
        <FlashcardButton mcqId={q.id} topicId={q.topic_id} hasCard={hasCard} />
      </div>
    </li>
  );
}

function FlashcardButton({
  mcqId,
  topicId,
  hasCard,
}: {
  mcqId: string;
  topicId: string;
  hasCard: boolean;
}) {
  const create = useServerFn(flashcardFromMistake);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const [done, setDone] = useState(hasCard);
  useEffect(() => setDone(hasCard), [hasCard]);

  if (done) {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 px-1 text-sm text-muted-foreground">
        <Check className="size-4 text-tint-1-fg" aria-hidden /> Já virou flashcard
      </span>
    );
  }
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await withAiRetry(
              () => create({ data: { mcq_id: mcqId } }),
              (s) => setRetryMsg(aiRetryLabel(s)),
            );
            setDone(true);
            toast.success("Flashcard criado no tópico.");
            void queryClient.invalidateQueries({ queryKey: ["mistake-questions"] });
            void queryClient.invalidateQueries({ queryKey: ["topic", topicId] });
            void queryClient.invalidateQueries({ queryKey: ["topics-progress"] });
          } catch (e) {
            toast.error(aiErrorMessage(e, "Não deu para criar o flashcard."));
          } finally {
            setBusy(false);
            setRetryMsg(null);
          }
        }}
      >
        {/* Enquanto espera, o círculo e o tempo ficam só na linha ao lado */}
        <Layers className="size-4" aria-hidden /> Criar flashcard
      </Button>
      <AiWait active={busy} label={retryMsg ?? "Escrevendo o flashcard"} />
      <span aria-live="polite" className="sr-only">
        {busy ? (retryMsg ?? "Criando o flashcard.") : ""}
      </span>
    </>
  );
}

/** Sessão de revisão: uma questão por vez, com a lista congelada no início. */
function PracticeSession({
  items,
  withCard,
  topicTitle,
  onExit,
}: {
  items: Item[];
  withCard: Set<string>;
  topicTitle: (id: string) => string;
  onExit: () => void;
}) {
  const queryClient = useQueryClient();
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const finished = idx >= items.length;
  const it = items[Math.min(idx, items.length - 1)]!;
  const q = it.question;
  const chosen = answers[q.id];
  const answered = chosen !== undefined;
  const okCount = items.filter((x) => answers[x.question.id] === x.question.correct_index).length;

  function answer(oi: number) {
    if (answered) return;
    setAnswers((a) => ({ ...a, [q.id]: oi }));
    void recordAttempts([{ question_id: q.id, chosen_index: oi, source: "erros" }]).then(() =>
      queryClient.invalidateQueries({ queryKey: ["mcq-attempts"] }),
    );
  }

  function next() {
    setIdx((i) => i + 1);
    window.requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  }

  // Atalhos: 1–4 (ou A–D) respondem, Enter avança
  useEffect(() => {
    if (finished) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (t?.closest("input, textarea, select, button, [contenteditable='true'], [role='dialog']"))
        return;
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
      const k = e.key.toLowerCase();
      if (k in map && !answered && map[k]! < q.options.length) {
        e.preventDefault();
        answer(map[k]!);
      } else if (k === "enter" && answered) {
        e.preventDefault();
        next();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main className="mx-auto w-full max-w-[760px] px-5 pb-24 pt-8 sm:px-8 lg:pt-12">
      <div className="flex items-center justify-between gap-3">
        <p className={eyebrow}>
          Caderno de erros{!finished && ` · questão ${idx + 1} de ${items.length}`}
        </p>
        <Button variant="ghost" size="sm" onClick={onExit}>
          <X className="size-4" aria-hidden /> Sair
        </Button>
      </div>
      <div
        role="progressbar"
        aria-label="Progresso da revisão"
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuenow={Math.min(idx + (answered ? 1 : 0), items.length)}
        className="mt-3 h-1 w-full overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-foreground transition-[width] duration-300"
          style={{
            width: `${(Math.min(idx + (answered ? 1 : 0), items.length) / items.length) * 100}%`,
          }}
        />
      </div>

      {finished ? (
        <section className="mt-10 animate-fade-up border-y border-border py-8 text-center">
          <p className={eyebrow}>Fim da revisão</p>
          <p className="mt-3 font-serif text-7xl leading-none tnum">
            {okCount}
            <span className="text-3xl text-muted-foreground">/{items.length}</span>
          </p>
          <p className="mx-auto mt-4 max-w-[46ch] text-sm text-muted-foreground">
            As que você acertou contam para sair do caderno ({RESOLVE_STREAK} acertos seguidos). As
            que errou continuam lá para a próxima rodada.
          </p>
          <Button className="mt-6" variant="outline" onClick={onExit}>
            <RotateCcw className="size-4" aria-hidden /> Voltar ao caderno
          </Button>
        </section>
      ) : (
        <section key={q.id} className="mt-8 animate-fade-up">
          <p className={cn(eyebrow, "mb-3 truncate")}>
            {topicTitle(q.topic_id)}
            {q.subtopic ? ` · ${q.subtopic}` : ""}
          </p>
          <QuestionStem ref={headingRef} tabIndex={-1} question={q.question} />

          <ol className="mt-6 space-y-2.5" aria-label="Alternativas">
            {q.options.map((opt, oi) => {
              const state = !answered
                ? "idle"
                : oi === q.correct_index
                  ? "correct"
                  : chosen === oi
                    ? "wrong"
                    : "dim";
              return (
                <li key={oi}>
                  <button
                    type="button"
                    disabled={answered}
                    onClick={() => answer(oi)}
                    aria-label={`${LETTERS[oi]}: ${opt}${state === "correct" ? " (correta)" : state === "wrong" ? " (sua resposta, errada)" : ""}`}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3.5 rounded-lg border px-4 py-3 text-left text-[0.98rem] leading-snug transition-[background-color,border-color,transform] duration-150 disabled:cursor-default",
                      state === "idle" &&
                        "border-border bg-card hover:border-foreground/30 active:scale-[0.99]",
                      state === "correct" && "border-tint-1-fg/40 bg-tint-1",
                      state === "wrong" && "border-tint-3-fg/40 bg-tint-3",
                      state === "dim" && "border-border bg-card opacity-60",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full border text-[0.8125rem] font-semibold",
                        state === "correct" && "border-transparent bg-tint-1-fg text-background",
                        state === "wrong" && "border-transparent bg-tint-3-fg text-background",
                        (state === "idle" || state === "dim") &&
                          "border-border text-muted-foreground",
                      )}
                    >
                      {state === "correct" ? (
                        <Check className="size-4" strokeWidth={2.8} />
                      ) : state === "wrong" ? (
                        <X className="size-4" strokeWidth={2.8} />
                      ) : (
                        LETTERS[oi]
                      )}
                    </span>
                    <span className="flex-1">{opt}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <p aria-live="polite" className="sr-only">
            {answered
              ? chosen === q.correct_index
                ? "Resposta correta."
                : `Resposta errada. A correta é a ${LETTERS[q.correct_index]}.`
              : ""}
          </p>

          {answered && (
            <div className="mt-4 animate-fade-up rounded-lg bg-tint-4 px-4 py-3.5 text-[0.95rem] leading-relaxed">
              <p>
                <strong className="font-semibold">
                  {chosen === q.correct_index ? "Acertou." : "Ainda não."}
                </strong>{" "}
                {q.explanation}
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <FlashcardButton mcqId={q.id} topicId={q.topic_id} hasCard={withCard.has(q.id)} />
            <Button onClick={next} disabled={!answered}>
              {idx === items.length - 1 ? "Ver resultado" : "Próxima"}{" "}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
