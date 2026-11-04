import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { splitVignette } from "@/lib/vignette";

/**
 * Enunciado de questão objetiva. Quando há vinheta clínica, ela aparece como texto corrido
 * (rótulo "Caso" no mesmo estilo do "Cenário clínico") e só a pergunta fica em destaque.
 */
export const QuestionStem = forwardRef<
  HTMLHeadingElement,
  { question: string; id?: string; tabIndex?: number; className?: string }
>(function QuestionStem({ question, id, tabIndex, className }, ref) {
  const { vignette, stem } = splitVignette(question);
  return (
    <div className={className}>
      {vignette && (
        <div className="mb-5 border-l-2 border-border pl-4">
          <p className="font-sans text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Caso
          </p>
          <p className="mt-2 max-w-[68ch] whitespace-pre-line font-sans text-[1.0625rem] leading-relaxed text-foreground [text-wrap:pretty]">
            {vignette}
          </p>
        </div>
      )}
      <h2
        id={id}
        ref={ref}
        tabIndex={tabIndex}
        className={cn(
          "leading-[1.18] outline-none [text-wrap:pretty]",
          vignette ? "text-[1.45rem] sm:text-[1.6rem]" : "text-[1.65rem] sm:text-[1.9rem]",
        )}
      >
        {stem}
      </h2>
    </div>
  );
});
