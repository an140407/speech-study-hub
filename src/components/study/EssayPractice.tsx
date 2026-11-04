import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Loader2, PenLine, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { QuestionStem } from "@/components/study/QuestionStem";
import { AiWait } from "@/components/study/AiWait";
import { supabase } from "@/integrations/supabase/client";
import { aiErrorMessage, aiRetryLabel, withAiRetry } from "@/lib/ai-busy";
import { cn } from "@/lib/utils";
import { scoreFormat, useEssays, type EssayAnswer, type EssayQuestion } from "@/lib/essays";
import { generateEssayQuestions, gradeEssay } from "@/lib/essays.functions";

const eyebrow =
  "font-sans text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground";
const MIN_CHARS = 20;

/** Cor da nota: verde a partir de 7, amarelo de 4 a 6,9, vermelho abaixo de 4 (o número sempre aparece junto). */
function band(score: number | null | undefined) {
  if (score === null || score === undefined) return "none";
  return score >= 7 ? "good" : score >= 4 ? "mid" : "low";
}

const draftKey = (id: string) => `fonolab:discursiva:${id}`;
function readDraft(id: string) {
  try {
    return localStorage.getItem(draftKey(id)) ?? "";
  } catch {
    return "";
  }
}
function writeDraft(id: string, text: string) {
  try {
    if (text) localStorage.setItem(draftKey(id), text);
    else localStorage.removeItem(draftKey(id));
  } catch {
    // sem armazenamento: o rascunho vale só enquanto a página está aberta
  }
}

export function EssayPractice({ topicId }: { topicId: string }) {
  const essays = useEssays(topicId);
  const queryClient = useQueryClient();
  const generate = useServerFn(generateEssayQuestions);
  const [idx, setIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const questions = essays.data?.questions ?? [];
  const current = Math.min(idx, Math.max(0, questions.length - 1));
  const q = questions[current];
  const history = q ? (essays.data?.answers[q.id] ?? []) : [];

  async function handleGenerate(count: number) {
    setGenerating(true);
    try {
      const before = questions.length;
      await withAiRetry(
        () => generate({ data: { topic_id: topicId, count } }),
        (s) => setRetryMsg(aiRetryLabel(s)),
      );
      await queryClient.invalidateQueries({ queryKey: ["essays", topicId] });
      setIdx(before); // vai direto para a primeira pergunta nova
      toast.success(count === 1 ? "Pergunta criada." : `${count} perguntas criadas.`);
    } catch (e) {
      toast.error(aiErrorMessage(e, "Não deu para gerar as perguntas."));
    } finally {
      setGenerating(false);
      setRetryMsg(null);
    }
  }

  // Aviso para leitor de tela (o contador visível fica de fora: seria lido a cada segundo)
  const generatingLive = (
    <p aria-live="polite" className="sr-only">
      {generating ? (retryMsg ?? "Criando as perguntas.") : ""}
    </p>
  );

  async function handleDelete() {
    if (!q) return;
    const { error } = await supabase.from("essay_questions").delete().eq("id", q.id);
    if (error) {
      toast.error("Não deu para excluir a pergunta.");
      return;
    }
    writeDraft(q.id, "");
    setConfirmDelete(false);
    setIdx((i) => Math.max(0, i - 1));
    await queryClient.invalidateQueries({ queryKey: ["essays", topicId] });
    void queryClient.invalidateQueries({ queryKey: ["essay-stats"] });
    toast.success("Pergunta excluída.");
  }

  if (essays.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Carregando discursivas">
        {[70, 90, 55].map((w, i) => (
          <div
            key={i}
            className="h-5 animate-pulse rounded bg-foreground/[0.06]"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    );
  }

  if (!q) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <PenLine className="mx-auto size-6 text-muted-foreground" aria-hidden />
        <p className="mt-3 font-serif text-2xl">Treine a resposta escrita</p>
        <p className="mx-auto mt-2 max-w-[52ch] text-sm text-muted-foreground">
          A IA cria perguntas discursivas sobre este tópico, você responde como numa prova e ela
          corrige com nota de 0 a 10, mostrando o que acertou, o que faltou e o que estava errado.
        </p>
        <Button className="mt-5" onClick={() => void handleGenerate(3)} disabled={generating}>
          {generating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-4" aria-hidden />
          )}
          {generating ? "Criando perguntas…" : "Criar 3 perguntas discursivas"}
        </Button>
        {generatingLive}
        {generating && (
          <div className="mt-4">
            <AiWait active label={retryMsg ?? "Escrevendo as perguntas e o gabarito"} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
      <section aria-labelledby="discursiva-atual">
        <div className="flex items-center justify-between gap-3">
          <p className={cn(eyebrow, "truncate")}>
            Discursiva {current + 1} de {questions.length}
            {q.subtopic ? ` · ${q.subtopic}` : ""}
          </p>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label="Excluir esta pergunta"
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>

        <QuestionStem id="discursiva-atual" className="mt-2" question={q.question} />

        <EssayAnswerBox
          key={q.id}
          question={q}
          history={history}
          onNext={current < questions.length - 1 ? () => setIdx(current + 1) : undefined}
        />
      </section>

      <aside aria-label="Navegação das discursivas" className="space-y-6">
        <div>
          <p className={eyebrow}>Suas discursivas</p>
          <ol className="mt-3 grid grid-cols-5 gap-2">
            {questions.map((item, i) => {
              const last = essays.data?.answers[item.id]?.[0];
              const b = band(last?.score);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setIdx(i)}
                    aria-current={i === current ? "true" : undefined}
                    aria-label={`Discursiva ${i + 1}${last?.score !== undefined && last?.score !== null ? `, última nota ${scoreFormat.format(last.score)}` : ", ainda não respondida"}`}
                    className={cn(
                      "flex h-10 w-full items-center justify-center rounded-md border text-sm tnum transition-colors",
                      i === current
                        ? "border-foreground bg-foreground text-background"
                        : b === "good"
                          ? "border-tint-1-fg/40 bg-tint-1 text-tint-1-fg"
                          : b === "mid"
                            ? "border-tint-4-fg/40 bg-tint-4 text-tint-4-fg"
                            : b === "low"
                              ? "border-tint-3-fg/40 bg-tint-3 text-tint-3-fg"
                              : "border-border hover:border-foreground/40",
                    )}
                  >
                    {i + 1}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            A cor é a última nota: verde ≥ 7, amarelo ≥ 4.
          </p>
        </div>
        <div className="border-t border-border pt-5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleGenerate(2)}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            {generating ? "Criando…" : "Criar mais 2"}
          </Button>
          {generatingLive}
          <AiWait
            active={generating}
            label={retryMsg ?? "Escrevendo as perguntas"}
            className="mt-3 flex"
          />
        </div>
      </aside>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta discursiva?</AlertDialogTitle>
            <AlertDialogDescription>
              A pergunta e as suas respostas corrigidas são apagadas. Isso não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EssayAnswerBox({
  question,
  history,
  onNext,
}: {
  question: EssayQuestion;
  history: EssayAnswer[];
  onNext: (() => void) | undefined;
}) {
  const grade = useServerFn(gradeEssay);
  const queryClient = useQueryClient();
  const fieldId = useId();
  const hintId = useId();
  const [text, setText] = useState(() => readDraft(question.id));
  const [grading, setGrading] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Resultado mostrado: o da correção que acabou de acontecer, senão a última salva.
  const [result, setResult] = useState<EssayAnswer | null>(history[0] ?? null);
  const [writing, setWriting] = useState(!history[0]);
  const resultRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const words = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);

  // Rascunho salvo neste navegador enquanto você escreve.
  useEffect(() => {
    const t = window.setTimeout(() => writeDraft(question.id, text), 400);
    return () => window.clearTimeout(t);
  }, [question.id, text]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < MIN_CHARS) {
      setError(`Escreva pelo menos ${MIN_CHARS} caracteres antes de pedir a correção.`);
      textareaRef.current?.focus();
      return;
    }
    setError(null);
    setGrading(true);
    try {
      const r = await withAiRetry(
        () => grade({ data: { question_id: question.id, answer: text.trim() } }),
        (s) => setRetryMsg(aiRetryLabel(s)),
      );
      setResult({
        id: r.id,
        question_id: question.id,
        answer: text.trim(),
        score: r.score,
        feedback: r.feedback,
        created_at: r.created_at,
      });
      setWriting(false);
      writeDraft(question.id, "");
      void queryClient.invalidateQueries({ queryKey: ["essays", question.topic_id] });
      void queryClient.invalidateQueries({ queryKey: ["essay-stats"] });
      window.requestAnimationFrame(() => resultRef.current?.focus());
    } catch (err) {
      setError(
        aiErrorMessage(err, "A correção falhou. Sua resposta continua aqui; tente de novo."),
      );
    } finally {
      setGrading(false);
      setRetryMsg(null);
    }
  }

  const previous = history.filter((h) => h.id !== result?.id && h.score !== null);

  return (
    <div className="mt-6">
      {writing ? (
        <form onSubmit={submit} noValidate>
          <label htmlFor={fieldId} className={eyebrow}>
            Sua resposta
          </label>
          <textarea
            id={fieldId}
            ref={textareaRef}
            name="resposta"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={10000}
            rows={9}
            spellCheck
            autoComplete="off"
            aria-describedby={hintId}
            aria-invalid={!!error}
            readOnly={grading}
            placeholder="Escreva como numa prova: o mecanismo, a relação com os achados e a conclusão…"
            className="mt-2 block min-h-[220px] w-full resize-y rounded-lg border border-input bg-card px-4 py-3 text-[1rem] leading-relaxed outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-ring)_18%,transparent)]"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            {/* A contagem de palavras muda a cada tecla: fica fora do aviso falado */}
            <p aria-live="polite" className="sr-only">
              {grading ? (retryMsg ?? "Corrigindo a resposta.") : (error ?? "")}
            </p>
            {grading ? (
              <AiWait active label={retryMsg ?? "Corrigindo e comparando com o gabarito"} />
            ) : (
              <p
                id={hintId}
                className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}
              >
                {error ??
                  `${words} ${words === 1 ? "palavra" : "palavras"} · rascunho salvo neste navegador`}
              </p>
            )}
            <div className="flex gap-2">
              {result && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setWriting(false)}
                  disabled={grading}
                >
                  Ver última correção
                </Button>
              )}
              {/* Enquanto corrige, o círculo e o tempo ficam só na linha da esquerda */}
              <Button type="submit" disabled={grading}>
                <Sparkles className="size-4" aria-hidden /> Corrigir com IA
              </Button>
            </div>
          </div>
        </form>
      ) : (
        result && (
          <div
            ref={resultRef}
            tabIndex={-1}
            className="animate-fade-up outline-none"
            aria-live="polite"
          >
            <GradeResult answer={result} />
            <details className="group mt-5 rounded-lg border border-border">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
                Ver a sua resposta e a resposta modelo
                <ChevronDown
                  className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="space-y-4 border-t border-border px-4 py-4 text-[0.95rem] leading-relaxed">
                <div>
                  <p className={eyebrow}>Você escreveu</p>
                  <p className="mt-1.5 whitespace-pre-line">{result.answer}</p>
                </div>
                <div>
                  <p className={eyebrow}>Resposta modelo</p>
                  <p className="mt-1.5 whitespace-pre-line">{question.expected_answer}</p>
                </div>
                {question.rubric.length > 0 && (
                  <div>
                    <p className={eyebrow}>Rubrica</p>
                    <ul className="mt-1.5 space-y-1">
                      {question.rubric.map((r, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="w-14 shrink-0 text-muted-foreground tnum">
                            {scoreFormat.format(r.points)} pts
                          </span>
                          <span>{r.item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
            {previous.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground tnum">
                Notas anteriores: {previous.map((h) => scoreFormat.format(h.score!)).join(" · ")}
              </p>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setText("");
                  setWriting(true);
                  window.requestAnimationFrame(() => textareaRef.current?.focus());
                }}
              >
                <RotateCcw className="size-4" aria-hidden /> Responder de novo
              </Button>
              {onNext && <Button onClick={onNext}>Próxima discursiva</Button>}
            </div>
          </div>
        )
      )}
    </div>
  );
}

function GradeResult({ answer }: { answer: EssayAnswer }) {
  const b = band(answer.score);
  const fb = answer.feedback;
  const block = (title: string, items: string[] | undefined, tone: "good" | "mid" | "low") =>
    items && items.length > 0 ? (
      <div
        className={cn(
          "rounded-lg px-4 py-3",
          tone === "good" && "bg-tint-1 text-tint-1-fg",
          tone === "mid" && "bg-tint-4 text-tint-4-fg",
          tone === "low" && "bg-tint-3 text-tint-3-fg",
        )}
      >
        <p className="text-sm font-semibold">{title}</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[0.95rem] leading-relaxed text-foreground">
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 border-y border-border py-5">
        <div>
          <p className={eyebrow}>Nota</p>
          <p className="mt-1 font-serif text-6xl leading-none tnum">
            {answer.score === null ? "—" : scoreFormat.format(answer.score)}
            <span className="text-2xl text-muted-foreground">/10</span>
          </p>
        </div>
        <span
          className={cn(
            "mb-1 rounded-md px-2.5 py-1 text-xs font-medium",
            b === "good" && "bg-tint-1 text-tint-1-fg",
            b === "mid" && "bg-tint-4 text-tint-4-fg",
            b === "low" && "bg-tint-3 text-tint-3-fg",
          )}
        >
          {b === "good" ? "Boa resposta" : b === "mid" ? "Parcial" : "Precisa revisar"}
        </span>
        {fb?.comentario && (
          <p className="w-full text-[0.95rem] leading-relaxed text-muted-foreground">
            {fb.comentario}
          </p>
        )}
      </div>
      <div className="mt-4 space-y-3">
        {block("O que você acertou", fb?.acertos, "good")}
        {block("O que faltou", fb?.faltou, "mid")}
        {block("O que estava errado", fb?.erros, "low")}
      </div>
    </div>
  );
}
