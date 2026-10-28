import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { supabase } from "@/integrations/supabase/client";
import { explainMcq, generateMoreMcq } from "@/lib/study-extra.functions";
import type { McqRow } from "@/lib/study-types";

const LETTERS = ["A", "B", "C", "D"];
const MAX_MCQ = 50;

export function McqPractice({
  questions,
  topicId,
  focus,
}: {
  questions: McqRow[];
  topicId: string;
  /** Vem do "Praticar este ramo" do Esquema: abre já filtrado pelo ramo. */
  focus?: { subtopic: string; key: number } | null;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [subtopic, setSubtopic] = useState<string | null>(focus?.subtopic ?? null);
  const [idx, setIdx] = useState(0);
  const [announce, setAnnounce] = useState("");
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["topic", topicId] });
  const headingRef = useRef<HTMLHeadingElement>(null);

  const subtopics = useMemo(
    () =>
      [...new Set(questions.map((q) => q.subtopic).filter((s): s is string => !!s))].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [questions],
  );

  useEffect(() => {
    if (!focus) return;
    setSubtopic(focus.subtopic);
    setIdx(0);
  }, [focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(
    () => (subtopic ? questions.filter((q) => q.subtopic === subtopic) : questions),
    [questions, subtopic],
  );
  const current = Math.min(idx, Math.max(0, list.length - 1));
  const q = list[current];
  const chosen = q ? answers[q.id] : undefined;
  const answered = chosen !== undefined;

  const okCount = list.filter(
    (x) => answers[x.id] !== undefined && answers[x.id] === x.correct_index,
  ).length;
  const missCount = list.filter(
    (x) => answers[x.id] !== undefined && answers[x.id] !== x.correct_index,
  ).length;

  async function answer(oi: number, item: McqRow) {
    if (answers[item.id] !== undefined) return;
    setAnswers((a) => ({ ...a, [item.id]: oi }));
    setAnnounce(
      oi === item.correct_index
        ? "Resposta correta."
        : `Resposta errada. A correta é a ${LETTERS[item.correct_index]}.`,
    );
    if (!item.seen_at) {
      await supabase.rpc("mark_mcq_seen", { p_mcq_id: item.id });
      queryClient.invalidateQueries({ queryKey: ["topics-progress"] });
      // atualiza o "Praticado" do Esquema
      refresh();
    }
  }

  function go(n: number) {
    if (n < 0 || n >= list.length) return;
    setIdx(n);
    setAnnounce("");
    window.requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  }

  // Atalhos: 1–4 (ou A–D) respondem, Enter / → avançam, ← volta
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (
        t?.closest(
          "input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']",
        )
      )
        return;
      if (!q) return;
      const k = e.key.toLowerCase();
      const map: Record<string, number> = {
        "1": 0,
        "2": 1,
        "3": 2,
        "4": 3,
        a: 0,
        b: 1,
        c: 2,
        d: 3,
      };
      if (k in map && !answered && map[k]! < q.options.length) {
        e.preventDefault();
        void answer(map[k]!, q);
      } else if ((k === "enter" && answered) || k === "arrowright") {
        if (t?.tagName === "BUTTON" && k === "enter") return; // Enter num botão já clica nele
        e.preventDefault();
        go(current + 1);
      } else if (k === "arrowleft") {
        e.preventDefault();
        go(current - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const actions = (
    <div className="flex flex-wrap gap-2">
      <McqEditorDialog
        topicId={topicId}
        subtopics={subtopics}
        onSaved={refresh}
        trigger={
          <Button variant="outline" size="sm" className="h-9">
            <Plus className="size-4" aria-hidden /> Criar questão
          </Button>
        }
      />
      <GenerateMcqDialog topicId={topicId} total={questions.length} />
    </div>
  );

  if (questions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-serif text-2xl">Ainda não há questões</p>
        <p className="mt-2 text-sm text-muted-foreground">Gere com IA ou escreva a sua.</p>
        <div className="mt-4 flex justify-center">{actions}</div>
      </div>
    );
  }

  return (
    <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <section aria-labelledby="questao-atual" className="min-w-0">
        {!q ? (
          <p className="text-muted-foreground">Sem questões neste ramo.</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <p className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground tnum">
                Questão {current + 1} de {list.length}
                {q.subtopic ? ` · ${q.subtopic}` : ""}
              </p>
              <div className="-mr-2 -mt-2 flex shrink-0">
                <McqEditorDialog
                  topicId={topicId}
                  question={q}
                  subtopics={subtopics}
                  onSaved={refresh}
                  trigger={
                    <button
                      type="button"
                      aria-label="Editar questão"
                      title="Editar questão"
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
                      aria-label="Excluir questão"
                      title="Excluir questão"
                      className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir esta questão?</AlertDialogTitle>
                      <AlertDialogDescription>Não pode ser desfeito.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={async () => {
                          const { error } = await supabase
                            .from("mcq_questions")
                            .delete()
                            .eq("id", q.id);
                          if (error) {
                            toast.error("Falha ao excluir a questão.");
                            return;
                          }
                          toast.success("Questão excluída.");
                          setIdx((v) => Math.max(0, v - 1));
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

            <h2
              id="questao-atual"
              ref={headingRef}
              tabIndex={-1}
              className="mt-2 text-[1.65rem] leading-[1.18] outline-none [text-wrap:pretty] sm:text-[1.9rem]"
            >
              {q.question}
            </h2>

            <ol className="mt-6 space-y-2.5" aria-label="Alternativas">
              {q.options.map((opt, oi) => {
                const isCorrect = oi === q.correct_index;
                const isChosen = chosen === oi;
                const state = !answered
                  ? "idle"
                  : isCorrect
                    ? "correct"
                    : isChosen
                      ? "wrong"
                      : "dim";
                return (
                  <li key={oi}>
                    <button
                      type="button"
                      disabled={answered}
                      onClick={() => void answer(oi, q)}
                      aria-label={`${LETTERS[oi]}: ${opt}${state === "correct" ? " (correta)" : state === "wrong" ? " (sua resposta, errada)" : ""}`}
                      className={cn(
                        "flex min-h-14 w-full items-center gap-3.5 rounded-lg border px-4 py-3 text-left text-[0.98rem] leading-snug transition-[background-color,border-color,transform] duration-150 disabled:cursor-default",
                        state === "idle" &&
                          "border-border bg-card hover:border-foreground/30 active:scale-[0.99]",
                        state === "correct" && "border-tint-1-fg/40 bg-tint-1",
                        state === "wrong" && "border-tint-3-fg/40 bg-tint-3",
                        state === "dim" && "border-border bg-card opacity-60",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full border text-[0.8125rem] font-semibold",
                          state === "correct" && "border-transparent bg-tint-1-fg text-white",
                          state === "wrong" && "border-transparent bg-tint-3-fg text-white",
                          (state === "idle" || state === "dim") &&
                            "border-border text-muted-foreground",
                        )}
                      >
                        {state === "correct" ? (
                          <Check className="size-4" strokeWidth={2.8} />
                        ) : state === "wrong" ? (
                          <X className="size-4" strokeWidth={2.8} />
                        ) : (
                          LETTERS[oi]
                        )}
                      </span>
                      <span className="flex-1">{opt}</span>
                      {state === "correct" && (
                        <span aria-hidden className="shrink-0 text-xs font-semibold text-tint-1-fg">
                          Correta
                        </span>
                      )}
                      {state === "wrong" && (
                        <span aria-hidden className="shrink-0 text-xs font-semibold text-tint-3-fg">
                          Sua resposta
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>

            {answered && (
              <div className="mt-4 animate-fade-up rounded-lg bg-tint-4 px-4 py-3.5 text-[0.95rem] leading-relaxed text-foreground">
                <p>
                  <strong className="font-semibold">Por quê?</strong> {q.explanation}
                </p>
                <AiExplanation mcqId={q.id} topicId={topicId} initial={q.ai_explanation} />
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-3">
              <Button variant="ghost" onClick={() => go(current - 1)} disabled={current === 0}>
                <ArrowLeft className="size-4" aria-hidden /> Anterior
              </Button>
              <Button onClick={() => go(current + 1)} disabled={current >= list.length - 1}>
                Próxima questão <ArrowRight className="size-4" aria-hidden />
              </Button>
            </div>
          </>
        )}
      </section>

      <aside aria-label="Navegação das questões" className="space-y-6">
        {subtopics.length > 0 && (
          <div>
            <label
              htmlFor="filtro-ramo"
              className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground"
            >
              Ramo
            </label>
            <Select
              value={subtopic ?? "__todos"}
              onValueChange={(v) => {
                setSubtopic(v === "__todos" ? null : v);
                setIdx(0);
              }}
            >
              <SelectTrigger id="filtro-ramo" className="mt-2 h-10 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__todos">Todos os ramos ({questions.length})</SelectItem>
                {subtopics.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s} ({questions.filter((x) => x.subtopic === s).length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Suas questões
          </p>
          <ol className="mt-2.5 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-5">
            {list.map((x, i) => {
              const a = answers[x.id];
              const st =
                a === undefined
                  ? x.seen_at
                    ? "seen"
                    : "todo"
                  : a === x.correct_index
                    ? "ok"
                    : "miss";
              const label = {
                ok: "certa",
                miss: "errada",
                seen: "já vista antes",
                todo: "por fazer",
              }[st];
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-label={`Questão ${i + 1}, ${label}`}
                    aria-current={i === current ? "true" : undefined}
                    className={cn(
                      "flex h-10 w-full items-center justify-center rounded-md border text-sm tnum transition-colors",
                      i === current && "border-foreground bg-foreground text-background",
                      i !== current &&
                        st === "ok" &&
                        "border-tint-1-fg/30 bg-tint-1 text-tint-1-fg",
                      i !== current &&
                        st === "miss" &&
                        "border-tint-3-fg/30 bg-tint-3 text-tint-3-fg",
                      i !== current &&
                        st === "seen" &&
                        "border-border bg-card text-muted-foreground",
                      i !== current &&
                        st === "todo" &&
                        "border-border bg-card hover:border-foreground/30",
                    )}
                  >
                    {i + 1}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground tnum">
            {okCount} {okCount === 1 ? "certa" : "certas"} · {missCount}{" "}
            {missCount === 1 ? "errada" : "erradas"} · {list.length - okCount - missCount} por fazer
          </p>
        </div>

        <div className="hidden lg:block">
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Atalhos
          </p>
          <ul className="mt-2.5 space-y-2 text-[0.8125rem] text-foreground/85">
            <li className="flex items-center gap-2">
              <kbd>1</kbd>–<kbd>4</kbd> marcar alternativa
            </li>
            <li className="flex items-center gap-2">
              <kbd>Enter</kbd> próxima questão
            </li>
            <li className="flex items-center gap-2">
              <kbd>←</kbd>
              <kbd>→</kbd> navegar
            </li>
          </ul>
        </div>

        <div className="border-t border-border pt-5">{actions}</div>
      </aside>
    </div>
  );
}

/** Cria uma questão nova (sem `question`) ou edita uma existente (com `question`). */
function McqEditorDialog({
  topicId,
  question,
  subtopics,
  trigger,
  onSaved,
}: {
  topicId: string;
  question?: McqRow;
  subtopics: string[];
  trigger: React.ReactNode;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState("0");
  const [explanation, setExplanation] = useState("");
  const [subtopic, setSubtopic] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setText(question?.question ?? "");
      setOptions(question?.options ? [...question.options] : ["", "", "", ""]);
      setCorrect(String(question?.correct_index ?? 0));
      setExplanation(question?.explanation ?? "");
      setSubtopic(question?.subtopic ?? "");
    }
  }, [open, question]);

  async function save() {
    const q = text.trim();
    const opts = options.map((o) => o.trim());
    if (!q || opts.some((o) => !o)) {
      toast.error("Preencha a pergunta e as 4 alternativas.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        question: q,
        options: opts,
        correct_index: Number(correct),
        explanation: explanation.trim(),
        subtopic: subtopic || null,
      };
      if (question) {
        const { error } = await supabase
          .from("mcq_questions")
          .update(payload)
          .eq("id", question.id);
        if (error) throw error;
        toast.success("Questão atualizada.");
      } else {
        const { error } = await supabase
          .from("mcq_questions")
          .insert({ topic_id: topicId, ...payload });
        if (error) throw error;
        toast.success("Questão criada.");
      }
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar a questão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{question ? "Editar questão" : "Criar questão"}</DialogTitle>
          <DialogDescription>
            {question
              ? "Ajuste a pergunta, as alternativas ou a explicação."
              : "Escreva sua própria questão de múltipla escolha."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium" htmlFor="mcq-q">
              Pergunta
            </label>
            <Textarea
              id="mcq-q"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <p className="text-sm font-medium">Alternativas (marque a correta)</p>
            <RadioGroup value={correct} onValueChange={setCorrect} className="mt-2 space-y-2">
              {options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <RadioGroupItem
                    value={String(oi)}
                    id={`mcq-opt-${oi}`}
                    aria-label={`${LETTERS[oi]} é a correta`}
                  />
                  <Input
                    value={opt}
                    onChange={(e) =>
                      setOptions((os) => os.map((o, i) => (i === oi ? e.target.value : o)))
                    }
                    placeholder={`Alternativa ${LETTERS[oi]}…`}
                    aria-label={`Texto da alternativa ${LETTERS[oi]}`}
                    className="flex-1"
                  />
                </div>
              ))}
            </RadioGroup>
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="mcq-exp">
              Explicação
            </label>
            <Textarea
              id="mcq-exp"
              rows={2}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="mcq-sub">
              Sub-tópico
            </label>
            <Select
              value={subtopic || "__none"}
              onValueChange={(v) => setSubtopic(v === "__none" ? "" : v)}
            >
              <SelectTrigger id="mcq-sub" className="mt-1">
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

function AiExplanation({
  mcqId,
  topicId,
  initial,
}: {
  mcqId: string;
  topicId: string;
  initial: string | null;
}) {
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
      <Button
        variant="outline"
        size="sm"
        className="h-9 bg-card/70"
        onClick={run}
        disabled={loading}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {loading ? "Explicando…" : text ? "Explicar de novo com IA" : "Explicar com IA"}
      </Button>
      {text && (
        <div className="mt-3 animate-fade-up whitespace-pre-line rounded-md bg-card/80 p-3 text-sm leading-relaxed">
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
        <Button variant="outline" size="sm" className="h-9" disabled={remaining === 0}>
          <Sparkles className="size-4" aria-hidden /> Gerar mais
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar mais questões</DialogTitle>
          <DialogDescription>
            Pode adicionar até {remaining} questões neste tópico.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label className="text-sm font-medium" htmlFor="qtd-mcq">
            Quantidade
          </label>
          <Input
            id="qtd-mcq"
            type="number"
            min={1}
            max={Math.min(20, remaining)}
            value={count}
            onChange={(e) =>
              setCount(Math.max(1, Math.min(Math.min(20, remaining), Number(e.target.value) || 1)))
            }
            className="mt-1"
          />
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