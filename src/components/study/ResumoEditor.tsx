import { useEffect, useRef, useState, type ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import {
  Bold, Italic, Highlighter as HighlighterIcon, List, Heading2, Heading3, Pilcrow, Pencil, Check,
  Table as TableIcon, BetweenHorizontalEnd, BetweenVerticalEnd, Rows3, Columns3, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/** Editor de resumo estilo Google Docs simplificado: título/subtítulo/texto normal,
 *  negrito (Ctrl+B), itálico (Ctrl+I), lista (Ctrl+Shift+8 — atalhos padrão do TipTap)
 *  e marcador. Começa em modo leitura, onde grifar ainda funciona automático ao
 *  selecionar (sem precisar entrar no editor); "Editar" liga a edição completa,
 *  onde o marcador passa a ser um botão (junto com o resto da formatação). Salva
 *  sozinho enquanto editando. */
export function ResumoEditor({
  topicId,
  html,
  maskMode,
  startEditing = false,
  readActions,
  onEditingDone,
}: {
  topicId: string;
  html: string;
  maskMode: boolean;
  startEditing?: boolean;
  /** Botões extras na linha do cabeçalho em modo leitura (ex.: Regenerar, Material original). */
  readActions?: ReactNode;
  /** Chamado ao clicar em Concluir, já com o conteúdo salvo. */
  onEditingDone?: (html: string) => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(content: string) {
    const { error } = await supabase
      .from("materials")
      .update({ content: { html: content } })
      .eq("topic_id", topicId)
      .eq("type", "summary");
    setStatus(error ? "idle" : "saved");
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Highlight.configure({ HTMLAttributes: { class: "fono-highlight" } }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: html,
    editable: startEditing,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: ed }) => {
      setStatus("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(ed.getHTML()), 800);
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
            <div className="mx-1 h-5 w-px bg-border" />
            <ToolbarBtn active={false} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Inserir tabela">
              <TableIcon className="size-4" />
            </ToolbarBtn>
            {editor.isActive("table") && (
              <>
                <ToolbarBtn active={false} onClick={() => editor.chain().focus().addRowAfter().run()} title="Adicionar linha abaixo">
                  <BetweenHorizontalEnd className="size-4" />
                </ToolbarBtn>
                <ToolbarBtn active={false} onClick={() => editor.chain().focus().addColumnAfter().run()} title="Adicionar coluna à direita">
                  <BetweenVerticalEnd className="size-4" />
                </ToolbarBtn>
                <ToolbarBtn active={false} onClick={() => editor.chain().focus().deleteRow().run()} title="Remover linha">
                  <Rows3 className="size-4" />
                </ToolbarBtn>
                <ToolbarBtn active={false} onClick={() => editor.chain().focus().deleteColumn().run()} title="Remover coluna">
                  <Columns3 className="size-4" />
                </ToolbarBtn>
                <ToolbarBtn active={false} onClick={() => editor.chain().focus().deleteTable().run()} title="Excluir tabela">
                  <Trash2 className="size-4" />
                </ToolbarBtn>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 pr-1">
            <span className="text-xs text-muted-foreground">
              {status === "saving" ? "Salvando…" : status === "saved" ? "Salvo" : ""}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (timer.current) {
                  clearTimeout(timer.current);
                  timer.current = null;
                }
                const content = editor.getHTML();
                await save(content);
                setEditing(false);
                onEditingDone?.(content);
              }}
            >
              <Check className="size-4" /> Concluir
            </Button>
          </div>
        </div>
      )}
      {!editing && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          {readActions}
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