import { useEffect, useRef, useState, type ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { Bold, Italic, Highlighter as HighlighterIcon, List, Heading2, Heading3, Pilcrow, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/** Editor de resumo estilo Google Docs simplificado: título/subtítulo/texto normal,
 *  negrito (Ctrl+B), itálico (Ctrl+I), lista (Ctrl+Shift+8 — atalhos padrão do TipTap)
 *  e marcador. Começa em modo leitura, onde grifar ainda funciona automático ao
 *  selecionar (sem precisar entrar no editor); "Editar" liga a edição completa,
 *  onde o marcador passa a ser um botão (junto com o resto da formatação). Salva
 *  sozinho enquanto editando. */
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

  // Fora do modo de edição, selecionar um trecho já grifa (ou remove o grifo, se já
  // estava grifado) — sem precisar de botão. É uma mutação programática, então
  // funciona mesmo com editable:false (que só bloqueia digitação/estrutura).
  function handleReadModeMouseUp() {
    if (editing) return;
    const { empty, to } = editor.state.selection;
    if (empty) return;
    editor.chain().toggleHighlight().setTextSelection(to).run();
  }

  return (
    <div>
      {editing && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-1 rounded-lg border border-border bg-card p-1">
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
            <ToolbarBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrito (Ctrl+B)">
              <Bold className="size-4" />
            </ToolbarBtn>
            <ToolbarBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Itálico (Ctrl+I)">
              <Italic className="size-4" />
            </ToolbarBtn>
            <ToolbarBtn active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Marcador">
              <HighlighterIcon className="size-4" />
            </ToolbarBtn>
            <ToolbarBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista (Ctrl+Shift+8)">
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
        </div>
      )}
      {!editing && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> Editar
          </Button>
        </div>
      )}
      <div onMouseUp={handleReadModeMouseUp}>
        <EditorContent
          editor={editor}
          className={cn(
            "prose-study resumo-editor min-h-[240px]",
            editing && "editing",
            !maskMode && "hide-marks",
          )}
        />
      </div>
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