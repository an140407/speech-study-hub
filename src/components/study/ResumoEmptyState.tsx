import { Loader2, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

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
        <h3 className="text-xl text-foreground">Ainda não há resumo</h3>
        <p className="mt-1 text-sm text-muted-foreground">Escreva o seu ou deixe a IA preparar um para você.</p>
      </div>
      <div className="grid w-full gap-3 sm:grid-cols-2">
        <Button variant="outline" className="h-auto flex-col gap-2 py-6 text-base" onClick={onWriteOwn} disabled={generating}>
          <Pencil className="size-6" />
          Escrever meu próprio resumo
        </Button>
        <Button className="h-auto flex-col gap-2 py-6 text-base" onClick={onGenerate} disabled={generating}>
          {generating ? <Loader2 className="size-6 animate-spin" /> : <Sparkles className="size-6" />}
          {generating ? "Gerando…" : "Gerar resumo com IA"}
        </Button>
      </div>
      {generating && <p className="text-sm text-muted-foreground">Isso costuma levar de 30 a 90 segundos.</p>}
    </div>
  );
}
