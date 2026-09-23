import { useState } from "react";
import { CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { explainMcq, generateMoreMcq } from "@/lib/study-extra.functions";
import type { McqRow } from "@/lib/study-types";

const LETTERS = ["A", "B", "C", "D"];
const MAX_MCQ = 50;

export function McqPractice({ questions, topicId }: { questions: McqRow[]; topicId: string }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const queryClient = useQueryClient();

  async function answer(oi: number, q: McqRow) {
    setAnswers((a) => ({ ...a, [q.id]: oi }));
    if (!q.seen_at) {
      await supabase.rpc("mark_mcq_seen", { p_mcq_id: q.id });
      queryClient.invalidateQueries({ queryKey: ["topics-progress"] });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{questions.length} de {MAX_MCQ} questões neste tópico</p>
        <GenerateMcqDialog topicId={topicId} total={questions.length} />
      </div>

      {questions.length === 0 && <p className="text-muted-foreground">Sem questões.</p>}

      {questions.map((q, qi) => {
        const chosen = answers[q.id];
        const answered = chosen !== undefined;
        const correct = answered && chosen === q.correct_index;
        return (
          <div key={q.id} className="card-soft p-5">
            <p className="font-medium leading-relaxed"><span className="mr-2 text-primary">{qi + 1}.</span>{q.question}</p>
            {q.subtopic && <p className="mt-1 text-xs text-muted-foreground">{q.subtopic}</p>}
            <div className="mt-3 grid gap-2">
              {q.options.map((opt, oi) => {
                const isCorrect = oi === q.correct_index;
                const isChosen = chosen === oi;
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={answered}
                    onClick={() => answer(oi, q)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors disabled:cursor-default",
                      !answered && "hover:bg-muted",
                      answered && isCorrect && "border-success/60 bg-success/10",
                      answered && isChosen && !isCorrect && "border-destructive/60 bg-destructive/10",
                      !answered && "border-border",
                    )}
                  >
                    <span className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      answered && isCorrect ? "bg-success text-success-foreground" : answered && isChosen ? "bg-destructive text-destructive-foreground" : "bg-muted",
                    )}>{LETTERS[oi]}</span>
                    <span className="pt-1">{opt}</span>
                  </button>
                );
              })}
            </div>
            {answered && (
              <>
                <div className={cn("mt-3 flex items-start gap-2 rounded-lg p-3 text-sm animate-fade-up", correct ? "bg-success/10 text-foreground" : "bg-destructive/10 text-foreground")}>
                  {correct ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
                  <div>
                    <p className="font-semibold">{correct ? "Correto!" : `Incorreto. Resposta: ${LETTERS[q.correct_index]}`}</p>
                    <p className="mt-1 text-muted-foreground">{q.explanation}</p>
                  </div>
                </div>
                <AiExplanation mcqId={q.id} topicId={topicId} initial={q.ai_explanation} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AiExplanation({ mcqId, topicId, initial }: { mcqId: string; topicId: string; initial: string | null }) {
  const [text, setText] = useState(initial);
  const [loading, setLoading] = useState(false);
  const explain = useServerFn(explainMcq);
  const queryClient = useQueryClient();

  async function run() {
    setLoading(true);
    try {
      const res = await explain({ data: { mcq_id: mcqId } });
      setText(res.ai_explanation);
      queryClient.invalidateQueries({ queryKey: ["topic", topicId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar a explicação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <Button variant="outline" size="sm" onClick={run} disabled={loading}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {loading ? "Explicando…" : text ? "Explicar de novo com IA" : "Explicar com IA"}
      </Button>
      {text && (
        <div className="animate-fade-up mt-3 whitespace-pre-line rounded-lg border border-primary/20 bg-accent/50 p-3 text-sm leading-relaxed">
          {text}
        </div>
      )}
    </div>
  );
}

function GenerateMcqDialog({ topicId, total }: { topicId: string; total: number }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const generate = useServerFn(generateMoreMcq);
  const queryClient = useQueryClient();
  const remaining = Math.max(0, MAX_MCQ - total);

  async function run() {
    setLoading(true);
    try {
      const res = await generate({ data: { topic_id: topicId, count } });
      await queryClient.invalidateQueries({ queryKey: ["topic", topicId] });
      toast.success(`${res.inserted} questões adicionadas.`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar questões.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={remaining === 0}>
          <Sparkles className="size-4" /> Gerar mais questões
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar mais questões</DialogTitle>
          <DialogDescription>Pode adicionar até {remaining} questões neste tópico.</DialogDescription>
        </DialogHeader>
        <div>
          <label className="text-sm font-medium" htmlFor="qtd-mcq">Quantidade</label>
          <Input
            id="qtd-mcq"
            type="number"
            min={1}
            max={Math.min(20, remaining)}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(Math.min(20, remaining), Number(e.target.value) || 1)))}
            className="mt-1"
          />
        </div>
        <DialogFooter>
          <Button onClick={run} disabled={loading || remaining === 0}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {loading ? "Gerando…" : "Gerar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}