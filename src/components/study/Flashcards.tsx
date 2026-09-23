import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, RotateCw, Sparkles, Layers, ChevronRight, Plus, Pencil } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { generateMoreFlashcards } from "@/lib/study-extra.functions";
import type { FlashcardRow } from "@/lib/study-types";

const MAX_CARDS = 100;
const SEM_SUB = "Sem sub-tópico";

export function Flashcards({ cards, topicId }: { cards: FlashcardRow[]; topicId: string }) {
  const [subtopic, setSubtopic] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["topic", topicId] });

  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) m.set(c.subtopic ?? SEM_SUB, (m.get(c.subtopic ?? SEM_SUB) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [cards]);
  const subtopicNames = groups.map(([n]) => n).filter((n) => n !== SEM_SUB);

  const filtered = useMemo(
    () => (subtopic === null ? cards : cards.filter((c) => (c.subtopic ?? SEM_SUB) === subtopic)),
    [cards, subtopic],
  );

  const card = filtered[Math.min(i, filtered.length - 1)];

  function go(n: number) {
    setFlipped(false);
    setTimeout(() => setI(n), 150);
  }

  async function handleFlip() {
    const next = !flipped;
    setFlipped(next);
    if (next && card && !card.seen_at && !seen[card.id]) {
      setSeen((s) => ({ ...s, [card.id]: true }));
      await supabase.rpc("mark_flashcard_seen", { p_flashcard_id: card.id });
      queryClient.invalidateQueries({ queryKey: ["topics-progress"] });
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <aside className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="size-4 text-primary" /> Sub-tópicos
        </div>
        <button
          type="button"
          onClick={() => { setSubtopic(null); go(0); }}
          className={cn(
            "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
            subtopic === null ? "border-primary/50 bg-accent" : "border-border bg-card hover:bg-muted",
          )}
        >
          <span>Todos</span>
          <span className="text-xs text-muted-foreground">{cards.length}</span>
        </button>
        <ul className="space-y-1.5">
          {groups.map(([name, count]) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => { setSubtopic(name); go(0); }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  subtopic === name ? "border-primary/50 bg-accent" : "border-border bg-card hover:bg-muted",
                )}
              >
                <span className="flex min-w-0 items-center gap-1">
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{name}</span>
                </span>
                <span className="text-xs text-muted-foreground">{count}</span>
              </button>
            </li>
          ))}
        </ul>
        <GenerateFlashcardsDialog topicId={topicId} total={cards.length} subtopics={subtopicNames} />
        <CardEditorDialog
          topicId={topicId}
          subtopics={subtopicNames}
          onSaved={refresh}
          trigger={
            <Button variant="outline" className="w-full">
              <Plus className="size-4" /> Criar card
            </Button>
          }
        />
      </aside>

      <div className="mx-auto w-full max-w-xl">
        {!card ? (
          <p className="text-muted-foreground">Sem flashcards neste sub-tópico.</p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-center gap-3">
              <p className="text-center text-xs text-muted-foreground">
                Cartão {Math.min(i, filtered.length - 1) + 1} de {filtered.length} · clique para virar
              </p>
              <CardEditorDialog
                topicId={topicId}
                card={card}
                subtopics={subtopicNames}
                onSaved={refresh}
                trigger={
                  <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                    <Pencil className="size-3.5" /> Editar
                  </button>
                }
              />
            </div>
            <div className="flip-scene h-72 cursor-pointer select-none" onClick={handleFlip}>
              <div className={cn("flip-inner relative h-full w-full", flipped && "flipped")}>
                <div className="flip-face card-soft absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                  <span className="mb-3 text-xs font-medium uppercase tracking-wider text-primary">
                    {card.subtopic ?? "Frente"}
                  </span>
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
              <Button variant="outline" onClick={() => go(i - 1)} disabled={i === 0}>
                <ArrowLeft className="size-4" /> Anterior
              </Button>
              <div className="flex max-w-[50%] flex-wrap justify-center gap-1">
                {filtered.map((_, k) => (
                  <span key={k} className={cn("size-1.5 rounded-full", k === i ? "bg-primary" : "bg-border")} />
                ))}
              </div>
              <Button variant="outline" onClick={() => go(i + 1)} disabled={i >= filtered.length - 1}>
                Próximo <ArrowRight className="size-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Cria um flashcard novo (sem card) ou edita um existente (com card) — mesmo diálogo pros dois casos. */
function CardEditorDialog({
  topicId,
  card,
  subtopics,
  trigger,
  onSaved,
}: {
  topicId: string;
  card?: FlashcardRow;
  subtopics: string[];
  trigger: React.ReactNode;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [subtopic, setSubtopic] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFront(card?.front ?? "");
      setBack(card?.back ?? "");
      setSubtopic(card?.subtopic ?? "");
    }
  }, [open, card]);

  async function save() {
    const f = front.trim();
    const b = back.trim();
    if (!f || !b) { toast.error("Preencha a frente e o verso do card."); return; }
    setSaving(true);
    try {
      if (card) {
        const { error } = await supabase
          .from("flashcards")
          .update({ front: f, back: b, subtopic: subtopic || null })
          .eq("id", card.id);
        if (error) throw error;
        toast.success("Card atualizado.");
      } else {
        const { error } = await supabase
          .from("flashcards")
          .insert({ topic_id: topicId, front: f, back: b, subtopic: subtopic || null });
        if (error) throw error;
        toast.success("Card criado.");
      }
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar o card.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{card ? "Editar card" : "Criar card"}</DialogTitle>
          <DialogDescription>
            {card ? "Ajuste a frente, o verso ou o sub-tópico deste card." : "Escreva seu próprio flashcard pra esse tópico."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium" htmlFor="card-front">Frente</label>
            <Textarea id="card-front" rows={2} value={front} onChange={(e) => setFront(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="card-back">Verso</label>
            <Textarea id="card-back" rows={3} value={back} onChange={(e) => setBack(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="card-subtopic">Sub-tópico</label>
            <Select value={subtopic || "__none"} onValueChange={(v) => setSubtopic(v === "__none" ? "" : v)}>
              <SelectTrigger id="card-subtopic" className="mt-1">
                <SelectValue placeholder="Sem sub-tópico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sem sub-tópico</SelectItem>
                {subtopics.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerateFlashcardsDialog({ topicId, total, subtopics }: { topicId: string; total: number; subtopics: string[] }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(5);
  const [focus, setFocus] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const generate = useServerFn(generateMoreFlashcards);
  const queryClient = useQueryClient();
  const remaining = Math.max(0, MAX_CARDS - total);

  async function run() {
    setLoading(true);
    try {
      const res = await generate({ data: { topic_id: topicId, count, subtopics: focus.length ? focus : undefined } });
      await queryClient.invalidateQueries({ queryKey: ["topic", topicId] });
      toast.success(`${res.inserted} flashcards adicionados.`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar flashcards.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="mt-3 w-full" disabled={remaining === 0}>
          <Sparkles className="size-4" /> Gerar mais flashcards
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar mais flashcards</DialogTitle>
          <DialogDescription>
            Você tem {total} de {MAX_CARDS} flashcards neste tópico. Pode adicionar até {remaining}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium" htmlFor="qtd-cards">Quantidade</label>
            <Input
              id="qtd-cards"
              type="number"
              min={1}
              max={Math.min(30, remaining)}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(Math.min(30, remaining), Number(e.target.value) || 1)))}
              className="mt-1"
            />
          </div>
          {subtopics.length > 0 && (
            <div>
              <p className="text-sm font-medium">Focar em sub-tópicos (opcional)</p>
              <ul className="mt-2 space-y-1.5">
                {subtopics.map((s) => (
                  <li key={s}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={focus.includes(s)}
                        onCheckedChange={(v) => setFocus((f) => (v ? [...f, s] : f.filter((x) => x !== s)))}
                      />
                      <span>{s}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
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