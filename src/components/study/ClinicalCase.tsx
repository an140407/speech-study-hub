import { useEffect, useRef, useState } from "react";
import { ChevronDown, Eye, Loader2, Sparkles, Stethoscope } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ClinicalCaseRow } from "@/lib/study-types";
import { HighlightableBlock, useHighlights } from "@/lib/highlight";
import { backfillClinicalCase, explainGuidingQuestion, generateClinicalCase } from "@/lib/study-extra.functions";

const MAX_CASES = 5;

export function ClinicalCase({ cases, topicId, maskMode }: { cases: ClinicalCaseRow[]; topicId: string; maskMode: boolean }) {
  const [index, setIndex] = useState(0);
  const current = cases[Math.min(index, cases.length - 1)];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {cases.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {cases.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setIndex(i)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  i === index ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                )}
              >
                Caso {i + 1}
              </button>
            ))}
          </div>
        )}
        <GenerateCaseButton topicId={topicId} total={cases.length} />
      </div>

      {!current ? (
        <p className="text-muted-foreground">Sem caso clínico.</p>
      ) : (
        <CaseView key={current.id} data={current} topicId={topicId} maskMode={maskMode} />
      )}
    </div>
  );
}

function CaseView({ data, topicId, maskMode }: { data: ClinicalCaseRow; topicId: string; maskMode: boolean }) {
  const [revealed, setRevealed] = useState(0);
  const [showCase, setShowCase] = useState(false);
  const total = data.guiding_questions.length;
  const { rangesFor, onSelect, onRemove } = useHighlights(topicId, "caso_clinico", data.id, maskMode);
  const queryClient = useQueryClient();
  const backfill = useServerFn(backfillClinicalCase);
  const done = useRef(false);

  // Backfill silencioso: preenche respostas / explicação geral que faltarem.
  useEffect(() => {
    const missing = data.guiding_questions.some((g) => !g.answer?.trim()) || !data.case_explanation?.trim();
    if (!missing || done.current) return;
    done.current = true;
    backfill({ data: { case_id: data.id } })
      .then((r) => { if (r.filled) queryClient.invalidateQueries({ queryKey: ["topic", topicId] }); })
      .catch(() => undefined);
  }, [data, backfill, queryClient, topicId]);

  return (
    <div className="space-y-4">
      <div className="card-soft p-6">
        <div className="mb-3 flex items-center gap-2 text-primary">
          <Stethoscope className="size-5" />
          <h3 className="text-lg font-semibold">Cenário clínico</h3>
        </div>
        <HighlightableBlock as="p" className="whitespace-pre-line leading-relaxed" blockIndex={0} text={data.scenario} ranges={rangesFor(0)} onSelect={onSelect} onRemove={onRemove} />
      </div>

      <div>
        <h3 className="mb-2 text-lg font-semibold">Perguntas guiadas</h3>
        <ol className="space-y-2">
          {data.guiding_questions.slice(0, revealed).map((q, i) => (
            <li key={i} className="card-soft animate-fade-up flex gap-3 p-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <HighlightableBlock as="p" className="pt-0.5 leading-relaxed" blockIndex={i + 1} text={q.question} ranges={rangesFor(i + 1)} onSelect={onSelect} onRemove={onRemove} />
                <GuidingAnswer caseId={data.id} topicId={topicId} index={i} answer={q.answer} aiExplanation={q.ai_explanation ?? null} />
              </div>
            </li>
          ))}
        </ol>
        {revealed < total ? (
          <Button variant="outline" className="mt-3" onClick={() => setRevealed((r) => r + 1)}>
            <Eye className="size-4" /> Revelar pergunta {revealed + 1} de {total}
          </Button>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Todas as perguntas foram reveladas. Reflita e escreva suas hipóteses.</p>
        )}
      </div>

      <div className="card-soft overflow-hidden">
        <button
          type="button"
          onClick={() => setShowCase((v) => !v)}
          className="flex w-full items-center justify-between gap-2 p-4 text-left font-semibold"
        >
          Explicar o caso inteiro
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", showCase && "rotate-180")} />
        </button>
        {showCase && (
          <div className="animate-fade-up px-4 pb-4">
            {data.case_explanation?.trim() ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{data.case_explanation}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Gerando a explicação geral do caso…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GuidingAnswer({
  caseId, topicId, index, answer, aiExplanation,
}: { caseId: string; topicId: string; index: number; answer: string; aiExplanation: string | null }) {
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
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setShow((v) => !v)}>
          <Eye className="size-4" /> {show ? "Esconder resposta" : "Ver resposta"}
        </Button>
        <Button variant="outline" size="sm" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {loading ? "Explicando…" : text ? "Explicar de novo com IA" : "Explicar com IA"}
        </Button>
      </div>
      {show && (
        <div className="animate-fade-up mt-2 space-y-2">
          <p className="rounded-lg bg-muted p-3 text-sm leading-relaxed">
            {answer?.trim() || "Resposta ainda sendo gerada…"}
          </p>
          {text && (
            <p className="whitespace-pre-line rounded-lg border border-primary/20 bg-accent/50 p-3 text-sm leading-relaxed">{text}</p>
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
    <Button variant="outline" size="sm" onClick={run} disabled={loading || total >= MAX_CASES}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      {loading ? "Gerando…" : total >= MAX_CASES ? `Limite de ${MAX_CASES} casos` : "Gerar mais um caso"}
    </Button>
  );
}
