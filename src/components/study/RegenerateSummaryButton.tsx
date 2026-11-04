import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiWait } from "@/components/study/AiWait";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function RegenerateSummaryButton({
  onConfirm,
  generating,
}: {
  onConfirm: () => void;
  generating: boolean;
}) {
  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={generating}>
            {generating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            {generating ? "Regenerando…" : "Regenerar resumo"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerar o resumo?</AlertDialogTitle>
            <AlertDialogDescription>
              O resumo atual, incluindo suas edições e grifos, será substituído. Não pode ser
              desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Regenerar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <span aria-live="polite" className="sr-only">
        {generating ? "Regenerando o resumo. Costuma levar de 30 a 90 segundos." : ""}
      </span>
      {/* Linha própria embaixo dos botões (a barra é flex-wrap e alinhada à direita) */}
      <AiWait
        active={generating}
        label="Reescrevendo o resumo"
        className="order-last basis-full justify-end"
      />
    </>
  );
}
