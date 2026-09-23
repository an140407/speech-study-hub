import { useEffect, useRef, useState, type ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { Bold, Italic, Highlighter as HighlighterIcon, List, Heading2, Heading3, Pilcrow, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/** Editor de resumo estilo Google Docs simplificado: título/subtítulo/texto normal,
 *  negrito, itálico e marcador (o grifo é parte do próprio texto — não precisa
 *  recalcular posição depois de uma edição). Começa em modo leitura; "Editar"
 *  liga a edição de verdade, pra selecionar texto pra ler/copiar não vire edição
 *  sem querer. Salva sozinho enquanto editando. */
export function ResumoEditor({ topicId, html, maskMode }: { topicId: string; html: string; maskMode: boolean }) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Highlight.configure({ HTMLAttributes: { class: "fono-highlight" } }),
    ],
    content: html,
    editable: false,
    onUpdate: ({ editor: ed }) => {
      setStatus("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const { error } = await supabase
          .from("materials")
          .update({ content: { html: ed.getHTML() } })
          .eq("topic_id", topicId)
          .eq("type", "summary");
        setStatus(error ? "idle" : "saved");
      }, 800);
    },
  });

  useEffect(() => {
    editor?.setEditable(editing);
  }, [editing, editor]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!editor) return null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-1 rounded-lg border border-border bg-card p-1">
        {editing ? (
          <>
            <div className="flex flex-wrap items-center gap-1">
              <ToolbarBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Título">
                <Heading2 className="size-4" />
              </ToolbarBtn>
              <ToolbarBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Subtítulo">
                <Heading3 className="size-4" />
              </ToolbarBtn>
              <ToolbarBtn active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()} title="Texto normal">
                <Pilcrow className="size-4" />
              </ToolbarBtn>
              <div className="mx-1 h-5 w-px bg-border" />
              <ToolbarBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrito">
                <Bold className="size-4" />
              </ToolbarBtn>
              <ToolbarBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Itálico">
                <Italic className="size-4" />
              </ToolbarBtn>
              <ToolbarBtn active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Marcador">
                <HighlighterIcon className="size-4" />
              </ToolbarBtn>
              <ToolbarBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista">
                <List className="size-4" />
              </ToolbarBtn>
            </div>
            <div className="flex items-center gap-2 pr-1">
              <span className="text-xs text-muted-foreground">
                {status === "saving" ? "Salvando…" : status === "saved" ? "Salvo" : ""}
              </span>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                <Check className="size-4" /> Concluir
              </Button>
            </div>
          </>
        ) : (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> Editar
          </Button>
        )}
      </div>
      <EditorContent
        editor={editor}
        className={cn(
          "prose-study min-h-[240px] focus-within:outline-none",
          editing && "rounded-xl border border-primary/30 bg-background p-4",
          !maskMode && "hide-marks",
        )}
      />
    </div>
  );
}

function ToolbarBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}