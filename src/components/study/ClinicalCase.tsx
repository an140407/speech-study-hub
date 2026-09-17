import { useState } from "react";
import { Eye, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClinicalCase as ClinicalCaseT } from "@/lib/study-types";

export function ClinicalCase({ data }: { data: ClinicalCaseT }) {
  const [revealed, setRevealed] = useState(0);
  const total = data.guiding_questions.length;
  return (
    <div className="space-y-4">
      <div className="card-soft p-6">
        <div className="mb-3 flex items-center gap-2 text-primary">
          <Stethoscope className="size-5" />
          <h3 className="text-lg font-semibold">Cenário clínico</h3>
        </div>
        <p className="whitespace-pre-line leading-relaxed">{data.scenario}</p>
      </div>
      <div>
        <h3 className="mb-2 text-lg font-semibold">Perguntas guiadas</h3>
        <ol className="space-y-2">
          {data.guiding_questions.slice(0, revealed).map((q, i) => (
            <li key={i} className="card-soft animate-fade-up flex gap-3 p-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{i + 1}</span>
              <p className="pt-0.5 leading-relaxed">{q}</p>
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
    </div>
  );
}
