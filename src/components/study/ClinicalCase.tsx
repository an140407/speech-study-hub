import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Eye, EyeOff, Loader2, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ClinicalCaseRow } from "@/lib/study-types";
import { HighlightableBlock, useHighlights } from "@/lib/highlight";
import {
  backfillClinicalCase,
  explainGuidingQuestion,
  generateClinicalCase,
} from "@/lib/study-extra.functions";

const MAX_CASES = 5;

export function ClinicalCase({
  cases,
  topicId,
  maskMode,
}: {
  cases: ClinicalCaseRow[];
  topicId: string;
  maskMode: boolean;
}) {
  const [index, setIndex] = useState(0);
  const current = cases[Math.min(index, cases.length - 1)];

  return (
    <div className="max-w-[760px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {cases.length > 1 ? (
          <div
            role="group"
            aria-label="Escolher caso"
            className="inline-flex flex-wrap rounded-lg border border-border bg-card p-1"
          >
            {cases.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-pressed={i === index}
                className={cn(
                  "h-9 rounded-md px-3 text-sm font-medium transition-colors",
                  i === index
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Caso {i + 1}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <GenerateCaseButton topicId={topicId} total={cases.length} />
      </div>

      {!current ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-serif text-2xl">Ainda não há caso clínico</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Gere um caso com IA para praticar o raciocínio clínico.
          </p>
        </div>
      ) : (
        <CaseView key={current.id} data={current} topicId={topicId} maskMode={maskMode} />
      )}
    </div>
  );
}

function CaseView({
  data,
  topicId,
  maskMode,
}: {
  data: ClinicalCaseRow;
  topicId: string;
  maskMode: boolean;
}) {
  const [revealed, setRevealed] = useState(0);
  const [showCase, setShowCase] = useState(false);
  const panelId = useId();
  const total = data.guiding_questions.length;
  const { rangesFor, onSelect, onRemove } = useHighlights(
    topicId,
    "caso_clinico",
    data.id,
    maskMode,
  );
  const queryClient = useQueryClient();
  const backfill = useServerFn(backfillClinicalCase);
  const done = useRef(false);

  // Backfill silencioso: preenche respostas / explicação geral que faltarem.
  useEffect(() => {
    const missing =
      data.guiding_questions.some((g) => !g.answer?.trim()) || !data.case_explanation?.trim();
    if (!missing || done.current) return;
    done.current = true;
    backfill({ data: { case_id: data.id } })
      .then((r) => {
        if (r.filled) queryClient.invalidateQueries({ queryKey: ["topic", topicId] });
      })
      .catch(() => undefined);
  }, [data, backfill, queryClient, topicId]);

  return (
    <div className="space-y-8">
      <section
        aria-labelledby={`${panelId}-cenario`}
        className="rounded-xl border border-border bg-card px-6 py-5 shadow-soft"
      >
        <h3
          id={`${panelId}-cenario`}
          className="font-sans text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground"
        >
          Cenário clínico
        </h3>
        <HighlightableBlock
          as="p"
          className="mt-3 whitespace-pre-line text-[1.0625rem] leading-relaxed"
          blockIndex={0}
          text={data.scenario}
          ranges={rangesFor(0)}
          onSelect={onSelect}
          onRemove={onRemove}
        />
      </section>

      <section aria-labelledby={`${panelId}-perguntas`}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 id={`${panelId}-perguntas`} className="text-[1.75rem] leading-none">
            Perguntas guiadas
          </h3>
          <span className="text-xs text-muted-foreground tnum">
            {revealed} de {total}
          </span>
        </div>
        <ol className="mt-4 divide-y divide-border border-y border-border">
          {data.guiding_questions.slice(0, revealed).map((q, i) => (
            <li key={i} className="flex animate-fade-up gap-4 py-4">
              <span className="w-6 shrink-0 pt-0.5 font-mono text-sm text-muted-foreground tnum">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <HighlightableBlock
                  as="p"
                  className="text-[1.0625rem] leading-relaxed"
                  blockIndex={i + 1}
                  text={q.question}
                  ranges={rangesFor(i + 1)}
                  onSelect={onSelect}
                  onRemove={onRemove}
                />
                <GuidingAnswer
                  caseId={data.id}
                  topicId={topicId}
                  index={i}
                  answer={q.answer}
                  aiExplanation={q.ai_explanation ?? null}
                />
              </div>
            </li>
          ))}
        </ol>
        {revealed < total ? (
          <Button variant="outline" className="mt-4" onClick={() => setRevealed((r) => r + 1)}>
            <Eye className="size-4" aria-hidden /> Revelar pergunta {revealed + 1} de {total}
          </Button>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Todas as perguntas foram reveladas. Escreva suas hipóteses antes de ver a explicação do
            caso.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowCase((v) => !v)}
          aria-expanded={showCase}
          aria-controls={`${panelId}-explicacao`}
          className="flex min-h-12 w-full items-center justify-between gap-2 px-5 py-3 text-left font-medium"
        >
          Explicar o caso inteiro
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              showCase && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        {showCase && (
          <div
            id={`${panelId}-explicacao`}
            className="animate-fade-up border-t border-border px-5 py-4"
          >
            {data.case_explanation?.trim() ? (
              <p className="whitespace-pre-line text-[0.98rem] leading-relaxed">
                {data.case_explanation}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Gerando a explicação geral do caso…</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function GuidingAnswer({
  caseId,
  topicId,
  index,
  answer,
  aiExplanation,
}: {
  caseId: string;
  topicId: string;
  index: number;
  answer: string;
  aiExplanation: string | null;
}) {
  const [show, setShow] = useState(false);
  const [text, setText] = useState(aiExplanation);
  const [loading, setLoading] = useState(false);
  const explain = useServerFn(explainGuidingQuestion);
  const queryClient = useQueryClient();

  async function run() {
    setLoading(true);
    try {
      const res = await explain({ data: { case_id: caseId, index } });
      setText(res.ai_explanation);
      setShow(true);
      queryClient.invalidateQueries({ queryKey: ["topic", topicId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar a explicação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => setShow((v) => !v)}
          aria-expanded={show}
        >
          {show ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}{" "}
          {show ? "Esconder resposta" : "Ver resposta"}
        </Button>
        <Button variant="ghost" size="sm" className="h-9" onClick={run} disabled={loading}>
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-4" aria-hidden />
          )}
          {loading ? "Explicando…" : text ? "Explicar de novo com IA" : "Explicar com IA"}
        </Button>
      </div>
      {show && (
        <div className="mt-3 animate-fade-up space-y-2">
          <p className="rounded-lg bg-tint-4 px-4 py-3 text-[0.95rem] leading-relaxed">
            {answer?.trim() || "Resposta ainda sendo gerada…"}
          </p>
          {text && (
            <p className="whitespace-pre-line rounded-lg border border-border bg-card px-4 py-3 text-[0.95rem] leading-relaxed">
              {text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function GenerateCaseButton({ topicId, total }: { topicId: string; total: number }) {
  const [loading, setLoading] = useState(false);
  const generate = useServerFn(generateClinicalCase);
  const queryClient = useQueryClient();

  async function run() {
    setLoading(true);
    try {
      await generate({ data: { topic_id: topicId } });
      await queryClient.invalidateQueries({ queryKey: ["topic", topicId] });
      toast.success("Novo caso clínico gerado!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar o caso.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-9"
      onClick={run}
      disabled={loading || total >= MAX_CASES}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Sparkles className="size-4" aria-hidden />
      )}
      {loading
        ? "Gerando…"
        : total >= MAX_CASES
          ? `Limite de ${MAX_CASES} casos`
          : "Gerar mais um caso"}
    </Button>
  );
}