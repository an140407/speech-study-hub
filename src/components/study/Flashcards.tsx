import { useState } from "react";
import { ArrowLeft, ArrowRight, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Flashcard } from "@/lib/study-types";

export function Flashcards({ cards }: { cards: Flashcard[] }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (cards.length === 0) return <p className="text-muted-foreground">Sem flashcards.</p>;
  const card = cards[i]!;
  const go = (n: number) => { setFlipped(false); setTimeout(() => setI(n), 150); };

  return (
    <div className="mx-auto max-w-xl">
      <p className="mb-3 text-center text-xs text-muted-foreground">Cartão {i + 1} de {cards.length} · clique para virar</p>
      <div className="flip-scene h-72 cursor-pointer select-none" onClick={() => setFlipped((f) => !f)}>
        <div className={cn("flip-inner relative h-full w-full", flipped && "flipped")}>
          <div className="flip-face card-soft absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
            <span className="mb-3 text-xs font-medium uppercase tracking-wider text-primary">Frente</span>
            <p className="font-serif text-xl font-semibold leading-snug">{card.front}</p>
            <RotateCw className="absolute bottom-4 right-4 size-4 text-muted-foreground" />
          </div>
          <div className="flip-face flip-back absolute inset-0 flex flex-col items-center justify-center rounded-xl border border-secondary bg-secondary p-8 text-center text-secondary-foreground shadow-soft">
            <span className="mb-3 text-xs font-medium uppercase tracking-wider opacity-70">Verso</span>
            <p className="text-base leading-relaxed">{card.back}</p>
          </div>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <Button variant="outline" onClick={() => go(i - 1)} disabled={i === 0}><ArrowLeft className="size-4" /> Anterior</Button>
        <div className="flex gap-1">
          {cards.map((_, k) => <span key={k} className={cn("size-1.5 rounded-full", k === i ? "bg-primary" : "bg-border")} />)}
        </div>
        <Button variant="outline" onClick={() => go(i + 1)} disabled={i === cards.length - 1}>Próximo <ArrowRight className="size-4" /></Button>
      </div>
    </div>
  );
}
