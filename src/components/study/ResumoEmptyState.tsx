import { Loader2, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiWait } from "@/components/study/AiWait";

export function ResumoEmptyState({
  onWriteOwn,
  onGenerate,
  generating,
}: {
  onWriteOwn: () => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  return (
    <div className="card-soft mx-auto flex max-w-2xl flex-col items-center gap-5 p-6 text-center sm:p-10">
      <div>
        <h2 className="text-xl text-foreground">Ainda não há resumo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Escreva o seu ou deixe a IA preparar um para você.
        </p>
      </div>
      <div className="grid w-full gap-3 sm:grid-cols-2">
        <Button
          variant="outline"
          className="h-auto flex-col gap-2 py-6 text-base"
          onClick={onWriteOwn}
          disabled={generating}
        >
          <Pencil className="size-6" aria-hidden />
          Escrever meu próprio resumo
        </Button>
        <Button
          className="h-auto flex-col gap-2 py-6 text-base"
          onClick={onGenerate}
          disabled={generating}
        >
          {generating ? (
            <Loader2 className="size-6 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-6" aria-hidden />
          )}
          {generating ? "Gerando…" : "Gerar resumo com IA"}
        </Button>
      </div>
      <p aria-live="polite" className="sr-only">
        {generating ? "Gerando o resumo. Costuma levar de 30 a 90 segundos." : ""}
      </p>
      {generating && (
        <div className="flex flex-col items-center gap-1">
          <AiWait active label="Escrevendo o resumo" />
          <p className="text-xs text-muted-foreground">Costuma levar de 30 a 90 segundos.</p>
        </div>
      )}
    </div>
  );
}
