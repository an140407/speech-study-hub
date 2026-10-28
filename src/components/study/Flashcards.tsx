import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  RotateCw,
  Sparkles,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { generateMoreFlashcards } from "@/lib/study-extra.functions";
import type { FlashcardRow } from "@/lib/study-types";

const MAX_CARDS = 100;
const SEM_SUB = "Sem sub-tópico";

export function Flashcards({
  cards,
  topicId,
  focus,
  mcqCounts,
  onGoQuestions,
}: {
  cards: FlashcardRow[];
  topicId: string;
  /** Vem do "Praticar este ramo" do Esquema: abre já filtrado pelo ramo. */
  focus?: { subtopic: string; key: number } | null;
  /** Quantas questões existem por ramo, para sugerir o próximo passo. */
  mcqCounts?: Record<string, number>;
  onGoQuestions?: (subtopic: string | null) => void;
}) {
  const [subtopic, setSubtopic] = useState<string | null>(focus?.subtopic ?? null);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!focus) return;
    setSubtopic(focus.subtopic);
    setI(0);
    setFlipped(false);
  }, [focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const pos = Math.min(i, Math.max(0, filtered.length - 1));
  const card = filtered[pos];
  const isLast = pos >= filtered.length - 1;
  const nextQuestions = subtopic
    ? (mcqCounts?.[subtopic] ?? 0)
    : Object.values(mcqCounts ?? {}).reduce((n, v) => n + v, 0);

  function go(n: number) {
    if (n < 0 || n >= filtered.length) return;
    setFlipped(false);
    setTimeout(() => setI(n), 150);
  }

  function pick(name: string | null) {
    setSubtopic(name);
    setFlipped(false);
    setI(0);
  }

  async function handleFlip() {
    const next = !flipped;
    setFlipped(next);
    if (next && card && !card.seen_at && !seen[card.id]) {
      setSeen((s) => ({ ...s, [card.id]: true }));
      await supabase.rpc("mark_flashcard_seen", { p_flashcard_id: card.id });
      queryClient.invalidateQueries({ queryKey: ["topics-progress"] });
      // atualiza o "Praticado" do Esquema
      queryClient.invalidateQueries({ queryKey: ["topic", topicId] });
    }
  }

  // Atalhos: Espaço vira, ← → navegam
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Logo depois de clicar na aba, o foco fica nela: Espaço vira o cartão,
      // mas as setas continuam trocando de aba (padrão do componente de abas)
      const onTab = !!t?.closest("[role='tab']");
      if (onTab && e.key !== " ") return;
      if (
        !onTab &&
        t?.closest(
          "input, textarea, select, button, [role='button'], [contenteditable='true'], [role='dialog'], [role='menu']",
        )
      )
        return;
      if (!card) return;
      if (e.key === " ") {
        e.preventDefault();
        void handleFlip();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(pos + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(pos - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const ramo = (active: boolean) =>
    cn(
      "flex min-h-10 w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
      active
        ? "bg-card font-medium text-foreground shadow-[0_0_0_1px_var(--color-border)]"
        : "text-foreground/80 hover:bg-accent hover:text-foreground",
    );

  return (
    <div className="grid gap-8 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10">
      <div className="min-w-0 md:col-start-2 md:row-start-1">
        {/* Celular: ramos numa faixa rolável acima do cartão (no PC ficam na lateral) */}
        <div
          role="group"
          aria-label="Ramos dos flashcards"
          className="-mx-5 mb-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:hidden"
        >
          <div className="flex w-max gap-2">
            {[[null, cards.length] as const, ...groups].map(([name, count]) => {
              const on = subtopic === name;
              return (
                <button
                  key={name ?? "__todos"}
                  type="button"
                  onClick={() => pick(name)}
                  aria-pressed={on}
                  className={cn(
                    "flex h-10 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm transition-colors",
                    on
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-foreground/80 hover:text-foreground",
                  )}
                >
                  {name ?? "Todos"}
                  <span
                    className={cn(
                      "text-xs tnum",
                      on ? "text-background/70" : "text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {!card ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="font-serif text-2xl">Sem flashcards aqui</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Gere mais com IA ou crie o seu cartão.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground tnum">
                {card.subtopic ?? "Sem ramo"} · cartão {pos + 1} de {filtered.length}
              </p>
              <div className="-mr-2 flex shrink-0">
                <CardEditorDialog
                  topicId={topicId}
                  card={card}
                  subtopics={subtopicNames}
                  onSaved={refresh}
                  trigger={
                    <button
                      type="button"
                      aria-label="Editar cartão"
                      title="Editar cartão"
                      className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                  }
                />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      aria-label="Excluir cartão"
                      title="Excluir cartão"
                      className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir este cartão?</AlertDialogTitle>
                      <AlertDialogDescription>Não pode ser desfeito.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={async () => {
                          const { error } = await supabase
                            .from("flashcards")
                            .delete()
                            .eq("id", card.id);
                          if (error) {
                            toast.error("Falha ao excluir o cartão.");
                            return;
                          }
                          toast.success("Cartão excluído.");
                          setI((v) => Math.max(0, v - 1));
                          refresh();
                        }}
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            <div
              role="button"
              tabIndex={0}
              aria-pressed={flipped}
              aria-label={
                flipped
                  ? `Resposta: ${card.back}. Aperte para voltar à pergunta.`
                  : `Pergunta: ${card.front}. Aperte para ver a resposta.`
              }
              onClick={() => void handleFlip()}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  void handleFlip();
                }
              }}
              className="flip-scene h-72 cursor-pointer select-none rounded-xl sm:h-80"
            >
              <div className={cn("flip-inner relative h-full w-full", flipped && "flipped")}>
                <div
                  aria-hidden={flipped}
                  className="flip-face absolute inset-0 flex flex-col items-center justify-center rounded-xl border border-border bg-card px-8 py-10 text-center shadow-lift"
                >
                  <span className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Pergunta
                  </span>
                  <p className="mt-4 max-w-[34ch] font-serif text-[1.6rem] leading-[1.2] [text-wrap:balance] sm:text-[1.85rem]">
                    {card.front}
                  </p>
                  <span className="absolute bottom-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <RotateCw className="size-3.5" aria-hidden />
                    <span className="pointer-coarse:hidden">
                      Clique ou aperte <kbd>Espaço</kbd> para ver a resposta
                    </span>
                    <span className="hidden pointer-coarse:inline">Toque para ver a resposta</span>
                  </span>
                </div>
                <div
                  aria-hidden={!flipped}
                  className="flip-face flip-back absolute inset-0 flex flex-col items-center justify-center rounded-xl border border-tint-4-fg/15 bg-tint-4 px-8 py-10 text-center"
                >
                  <span className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-tint-4-fg">
                    Resposta
                  </span>
                  <p className="mt-4 max-w-[52ch] text-[1.05rem] leading-relaxed text-foreground [text-wrap:pretty]">
                    {card.back}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-4">
              <Button variant="ghost" onClick={() => go(pos - 1)} disabled={pos === 0}>
                <ArrowLeft className="size-4" aria-hidden />{" "}
                <span className="sr-only sm:not-sr-only">Anterior</span>
              </Button>
              <div className="min-w-0 flex-1">
                <div
                  role="progressbar"
                  aria-label="Progresso nos cartões"
                  aria-valuemin={1}
                  aria-valuemax={filtered.length}
                  aria-valuenow={pos + 1}
                  className="h-1 overflow-hidden rounded-full bg-border"
                >
                  <div
                    className="h-full rounded-full bg-foreground transition-[width] duration-300"
                    style={{ width: `${((pos + 1) / filtered.length) * 100}%` }}
                  />
                </div>
                <p className="mt-1.5 text-center text-xs text-muted-foreground tnum">
                  {pos + 1} de {filtered.length}
                </p>
              </div>
              <Button onClick={() => go(pos + 1)} disabled={isLast}>
                <span className="sr-only sm:not-sr-only">Próximo</span>{" "}
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </div>

            <p className="mt-4 hidden items-center gap-3 text-xs text-muted-foreground md:flex">
              <span className="flex items-center gap-1.5">
                <kbd>Espaço</kbd> virar
              </span>
              <span className="flex items-center gap-1.5">
                <kbd>←</kbd>
                <kbd>→</kbd> navegar
              </span>
            </p>

            {isLast && flipped && onGoQuestions && nextQuestions > 0 && (
              <div className="mt-6 flex animate-fade-up flex-wrap items-center gap-4 rounded-lg border border-border bg-card px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    Próximo passo: {nextQuestions} {nextQuestions === 1 ? "questão" : "questões"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Fixe o que acabou de revisar respondendo as questões{" "}
                    {subtopic ? `de ${subtopic}` : "do tópico"}.
                  </p>
                </div>
                <Button variant="outline" onClick={() => onGoQuestions(subtopic)}>
                  Responder <ArrowRight className="size-4" aria-hidden />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      <aside aria-label="Organizar flashcards" className="space-y-5 md:col-start-1 md:row-start-1">
        <div className="hidden md:block">
          <p className="px-3 text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Ramos
          </p>
          <ul className="mt-2 space-y-0.5">
            <li>
              <button
                type="button"
                onClick={() => pick(null)}
                aria-pressed={subtopic === null}
                className={ramo(subtopic === null)}
              >
                <span>Todos</span>
                <span className="text-xs text-muted-foreground tnum">{cards.length}</span>
              </button>
            </li>
            {groups.map(([name, count]) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => pick(name)}
                  aria-pressed={subtopic === name}
                  className={ramo(subtopic === name)}
                >
                  <span className="min-w-0 truncate">{name}</span>
                  <span className="text-xs text-muted-foreground tnum">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2 border-t border-border pt-5">
          <GenerateFlashcardsDialog
            topicId={topicId}
            total={cards.length}
            subtopics={subtopicNames}
          />
          <CardEditorDialog
            topicId={topicId}
            subtopics={subtopicNames}
            onSaved={refresh}
            trigger={
              <Button variant="ghost" className="h-9 w-full">
                <Plus className="size-4" aria-hidden /> Criar cartão
              </Button>
            }
          />
        </div>
      </aside>
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
    if (!f || !b) {
      toast.error("Preencha a frente e o verso do card.");
      return;
    }
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
            {card
              ? "Ajuste a frente, o verso ou o sub-tópico deste card."
              : "Escreva seu próprio flashcard pra esse tópico."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium" htmlFor="card-front">
              Frente
            </label>
            <Textarea
              id="card-front"
              rows={2}
              value={front}
              onChange={(e) => setFront(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="card-back">
              Verso
            </label>
            <Textarea
              id="card-back"
              rows={3}
              value={back}
              onChange={(e) => setBack(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="card-subtopic">
              Sub-tópico
            </label>
            <Select
              value={subtopic || "__none"}
              onValueChange={(v) => setSubtopic(v === "__none" ? "" : v)}
            >
              <SelectTrigger id="card-subtopic" className="mt-1">
                <SelectValue placeholder="Sem sub-tópico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sem sub-tópico</SelectItem>
                {subtopics.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
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

function GenerateFlashcardsDialog({
  topicId,
  total,
  subtopics,
}: {
  topicId: string;
  total: number;
  subtopics: string[];
}) {
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
      const res = await generate({
        data: { topic_id: topicId, count, subtopics: focus.length ? focus : undefined },
      });
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
        <Button variant="outline" className="h-9 w-full" disabled={remaining === 0}>
          <Sparkles className="size-4" aria-hidden /> Gerar mais cartões
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
            <label className="text-sm font-medium" htmlFor="qtd-cards">
              Quantidade
            </label>
            <Input
              id="qtd-cards"
              type="number"
              min={1}
              max={Math.min(30, remaining)}
              value={count}
              onChange={(e) =>
                setCount(
                  Math.max(1, Math.min(Math.min(30, remaining), Number(e.target.value) || 1)),
                )
              }
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
                        onCheckedChange={(v) =>
                          setFocus((f) => (v ? [...f, s] : f.filter((x) => x !== s)))
                        }
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
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {loading ? "Gerando…" : "Gerar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}