import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Extension, type Editor } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { MessageSquarePlus, Pencil, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resolveNotes, useNoteActions, useNotes, type NoteRow } from "@/lib/notes";
import { cn } from "@/lib/utils";

/* ---------- Extensão do editor: abre "espaços" entre os blocos para as notas ---------- */

const notesKey = new PluginKey<DecorationSet>("fonolab-notas");

/** Guarda as decorações das notas (espaços entre blocos onde o React desenha as notas). */
export const NotesExtension = Extension.create({
  name: "fonolabNotas",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: notesKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const next = tr.getMeta(notesKey) as DecorationSet | undefined;
            return next ?? set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => notesKey.getState(state),
        },
      }),
    ];
  },
});

/** Texto e posição final de cada bloco do resumo (parágrafo, lista, tabela, título). */
function readBlocks(editor: Editor) {
  const blocks: { text: string; end: number; heading: boolean }[] = [];
  editor.state.doc.forEach((node, offset) => {
    blocks.push({
      text: node.textContent,
      end: offset + node.nodeSize,
      heading: node.type.name === "heading" && node.attrs["level"] === 2,
    });
  });
  return blocks;
}

const field =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-[0.9375rem] leading-relaxed outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-ring)_18%,transparent)]";

/** Borda direita visível: a do primeiro ancestral que corta o conteúdo, ou a da janela. */
function clipRight(el: HTMLElement) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p);
    if (o.overflowX !== "visible" || o.overflowY !== "visible")
      return p.getBoundingClientRect().right;
  }
  return window.innerWidth;
}

/* ------------------------------ Camada de notas ------------------------------ */

/**
 * Desenha as notas logo abaixo do bloco anotado, como anotação de caneta na margem,
 * e mostra o botão "Anotar" ao passar o mouse num bloco. Fica desligada na edição.
 */
export function NotesLayer({
  editor,
  topicId,
  enabled,
  children,
}: {
  editor: Editor;
  topicId: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const notes = useNotes(topicId);
  const actions = useNoteActions(topicId);
  const wrap = useRef<HTMLDivElement>(null);
  const slots = useRef(new Map<number, HTMLElement>());
  const [composerAt, setComposerAt] = useState<number | null>(null);
  const [hover, setHover] = useState<{ index: number; top: number; outside: boolean } | null>(null);

  const docKey = editor.state.doc;
  const blocks = useMemo(() => readBlocks(editor), [editor, docKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const resolved = useMemo(
    () =>
      resolveNotes(
        notes.data ?? [],
        blocks.map((b) => b.text),
      ),
    [notes.data, blocks],
  );

  const active = useMemo(() => {
    if (!enabled) return [] as number[];
    const set = new Set(resolved.byBlock.keys());
    if (composerAt !== null && composerAt < blocks.length) set.add(composerAt);
    return [...set].sort((a, b) => a - b);
  }, [enabled, resolved, composerAt, blocks.length]);

  const slotFor = (i: number) => {
    let el = slots.current.get(i);
    if (!el) {
      el = document.createElement("div");
      el.className = "nota-slot";
      el.contentEditable = "false";
      el.dataset["noteWidget"] = "";
      slots.current.set(i, el);
    }
    return el;
  };

  // Atualiza os espaços das notas no editor (sem mexer no texto do resumo)
  useEffect(() => {
    if (editor.isDestroyed) return;
    const decos = active
      .filter((i) => blocks[i])
      .map((i) =>
        Decoration.widget(blocks[i]!.end, slotFor(i), {
          side: 1,
          key: `nota-${i}`,
          ignoreSelection: true,
          stopEvent: () => true,
        }),
      );
    const tr = editor.state.tr
      .setMeta(notesKey, DecorationSet.create(editor.state.doc, decos))
      .setMeta("addToHistory", false);
    editor.view.dispatch(tr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, active.join(","), blocks]);

  function onMove(e: React.MouseEvent) {
    if (!enabled || !wrap.current) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-note-widget], [data-note-add]")) return;
    const root = editor.view.dom;
    let el: HTMLElement | null = target;
    while (el && el.parentElement !== root) el = el.parentElement;
    if (!el || el.dataset["noteWidget"] !== undefined) return;
    let index: number;
    try {
      index = editor.state.doc.resolve(editor.view.posAtDOM(el, 0)).index(0);
    } catch {
      return;
    }
    const box = wrap.current.getBoundingClientRect();
    const top = el.getBoundingClientRect().top - box.top;
    // O botão vai para a margem direita quando há espaço; senão, fica no canto do bloco
    const outside = box.right + 48 <= clipRight(wrap.current);
    if (hover?.index !== index || hover.top !== top || hover.outside !== outside)
      setHover({ index, top, outside });
  }

  const close = () => setComposerAt(null);

  return (
    <>
      <div ref={wrap} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {children}
        {enabled && hover && composerAt !== hover.index && (
          <button
            type="button"
            data-note-add=""
            aria-hidden
            tabIndex={-1}
            title="Anotar neste trecho"
            onClick={() => {
              setComposerAt(hover.index);
              setHover(null);
            }}
            style={{ top: hover.top }}
            className={cn(
              "absolute flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-soft transition-colors hover:text-pen",
              hover.outside ? "left-[calc(100%+0.5rem)]" : "right-0 -translate-y-1",
            )}
          >
            <MessageSquarePlus className="size-4" />
          </button>
        )}
      </div>

      {active.map((i) =>
        createPortal(
          <div className="my-3 grid gap-2" key={i}>
            {(resolved.byBlock.get(i) ?? []).map((n) => (
              <NoteCard key={n.id} note={n} actions={actions} />
            ))}
            {composerAt === i && (
              <NoteComposer
                onCancel={close}
                onSave={async (content) => {
                  await actions.create.mutateAsync({
                    blockIndex: i,
                    blockText: blocks[i]?.text ?? "",
                    content,
                  });
                  close();
                }}
              />
            )}
          </div>,
          slotFor(i),
          `nota-${i}`,
        ),
      )}

      {enabled && resolved.orphans.length > 0 && (
        <section aria-labelledby="notas-soltas" className="mt-10 border-t border-border pt-5">
          <h2 id="notas-soltas" className="font-serif text-[1.35rem] leading-tight">
            Notas sem lugar
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            O trecho onde estas notas estavam mudou (o resumo foi refeito ou editado).
          </p>
          <div className="mt-3 grid gap-2">
            {resolved.orphans.map((n) => (
              <NoteCard key={n.id} note={n} actions={actions} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function NoteCard({
  note,
  actions,
}: {
  note: NoteRow;
  actions: ReturnType<typeof useNoteActions>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (editing) {
    return (
      <NoteComposer
        initial={note.content}
        onCancel={() => setEditing(false)}
        onSave={async (content) => {
          await actions.update.mutateAsync({ id: note.id, content });
          setEditing(false);
        }}
      />
    );
  }
  return (
    <aside
      aria-label="Sua nota"
      className="group relative rounded-r-md border-l-2 border-pen/60 bg-pen/[0.05] py-2 pl-3 pr-20"
    >
      {/* div, não p: dentro do resumo os estilos de parágrafo do texto não podem valer aqui */}
      <div className="font-sans text-[0.625rem] font-medium uppercase tracking-[0.14em] text-pen/80">
        Nota
      </div>
      <div className="mt-0.5 whitespace-pre-wrap text-[0.95rem] leading-relaxed text-pen">
        {note.content}
      </div>
      <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        {confirming ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-destructive hover:text-destructive"
            onClick={() =>
              actions.remove.mutate(note.id, {
                onError: (e) => toast.error(e.message),
                onSettled: () => setConfirming(false),
              })
            }
            onBlur={() => setConfirming(false)}
            autoFocus
          >
            Apagar?
          </Button>
        ) : (
          <>
            <button
              type="button"
              aria-label="Editar nota"
              onClick={() => setEditing(true)}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Apagar nota"
              onClick={() => setConfirming(true)}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

function NoteComposer({
  initial = "",
  onSave,
  onCancel,
}: {
  initial?: string;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  async function submit() {
    if (!value.trim()) return onCancel();
    setSaving(true);
    try {
      await onSave(value);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para salvar a nota.");
      setSaving(false);
    }
  }

  return (
    <div className="rounded-r-md border-l-2 border-pen bg-pen/[0.05] py-2 pl-3 pr-2">
      <label htmlFor={id} className="sr-only">
        Sua nota
      </label>
      <textarea
        id={id}
        ref={ref}
        value={value}
        rows={3}
        maxLength={5000}
        placeholder="Escreva sua nota…"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit();
        }}
        className={cn(field, "min-h-20 resize-y")}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Ctrl+Enter salva · Esc cancela
        </span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={saving}>
            {saving ? "Salvando…" : "Salvar nota"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------- "Nova nota": caminho pelo teclado e pelo celular -------------- */

/** Botão do cabeçalho do resumo: escreve uma nota e escolhe a seção onde ela fica. */
export function NewNoteButton({ editor, topicId }: { editor: Editor; topicId: string }) {
  const actions = useNoteActions(topicId);
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState("0");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const textId = useId();
  const selectId = useId();

  const sections = useMemo(() => {
    if (!open) return [];
    const list: { index: number; title: string }[] = [];
    readBlocks(editor).forEach((b, i) => {
      if (b.heading) list.push({ index: i, title: b.text.trim() });
    });
    return list.length ? list : [{ index: 0, title: "Início do resumo" }];
  }, [open, editor]);

  async function save() {
    const chosen = sections[Number(section)] ?? sections[0];
    if (!chosen || !value.trim()) return;
    setSaving(true);
    try {
      const blocks = readBlocks(editor);
      await actions.create.mutateAsync({
        blockIndex: chosen.index,
        blockText: blocks[chosen.index]?.text ?? "",
        content: value,
      });
      toast.success(`Nota adicionada em “${chosen.title}”.`);
      setValue("");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para salvar a nota.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" className="h-9 text-sm" onClick={() => setOpen(true)}>
        <StickyNote className="size-4" aria-hidden /> Nota
      </Button>
      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="text-[1.6rem] font-normal leading-none">Nova nota</DialogTitle>
            <DialogDescription>
              A nota aparece logo abaixo do título da seção. Para anotar um parágrafo específico,
              passe o mouse nele e use o botão de nota que aparece ao lado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor={selectId} className="text-sm font-medium">
              Seção
            </label>
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger id={selectId} className="h-11 bg-card text-[0.9375rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[min(22rem,var(--radix-select-content-available-height))]">
                {sections.map((s, i) => (
                  <SelectItem key={s.index} value={String(i)} className="py-2 text-[0.9375rem]">
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={textId} className="text-sm font-medium">
              Nota
            </label>
            <textarea
              id={textId}
              value={value}
              rows={4}
              maxLength={5000}
              placeholder="Ex.: perguntar na aula a diferença entre PAIR e presbiacusia"
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
              }}
              className={cn(field, "min-h-24 resize-y")}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={saving || !value.trim()}>
              {saving ? "Salvando…" : "Salvar nota"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
