import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Mcq } from "@/lib/study-types";

const LETTERS = ["A", "B", "C", "D"];

export function McqPractice({ questions }: { questions: Mcq[] }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  if (questions.length === 0) return <p className="text-muted-foreground">Sem questões.</p>;
  return (
    <div className="space-y-4">
      {questions.map((q, qi) => {
        const chosen = answers[qi];
        const answered = chosen !== undefined;
        const correct = answered && chosen === q.correct_index;
        return (
          <div key={qi} className="card-soft p-5">
            <p className="font-medium leading-relaxed"><span className="mr-2 text-primary">{qi + 1}.</span>{q.question}</p>
            <div className="mt-3 grid gap-2">
              {q.options.map((opt, oi) => {
                const isCorrect = oi === q.correct_index;
                const isChosen = chosen === oi;
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={answered}
                    onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
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
              <div className={cn("mt-3 flex items-start gap-2 rounded-lg p-3 text-sm animate-fade-up", correct ? "bg-success/10 text-foreground" : "bg-destructive/10 text-foreground")}>
                {correct ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
                <div>
                  <p className="font-semibold">{correct ? "Correto!" : `Incorreto. Resposta: ${LETTERS[q.correct_index]}`}</p>
                  <p className="mt-1 text-muted-foreground">{q.explanation}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
