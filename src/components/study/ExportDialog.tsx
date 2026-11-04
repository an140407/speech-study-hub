import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Printer } from "lucide-react";
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
import { Segmented } from "@/components/study/Segmented";
import { supabase } from "@/integrations/supabase/client";
import {
  buildExportHtml,
  fileNameFor,
  htmlToDocx,
  type ExportInput,
  type ExportPart,
} from "@/lib/export-doc";
import type { FlowContent } from "@/lib/flow";
import type { Mnemonic } from "@/lib/mnemonics";
import { delatex } from "@/lib/delatex";
import { useNotes } from "@/lib/notes";
import { cn } from "@/lib/utils";

type Format = "pdf" | "docx";

/** Estilo do PDF (impressão): papel branco, tinta escura, títulos com serifa. */
const PRINT_CSS = `
.export-portal { display: none; }
@media print {
  @page { margin: 16mm 15mm; }
  body:has(> .export-portal) > *:not(.export-portal) { display: none !important; }
  .export-portal { display: block; color: #1f1d1a; font-family: var(--font-sans), system-ui, sans-serif; font-size: 10.5pt; line-height: 1.55; }
  .export-portal * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .export-portal h1, .export-portal h2, .export-portal h3 { break-after: avoid; font-weight: 400; }
  .export-portal h1 { font-family: var(--font-serif), Georgia, serif; font-size: 20pt; margin: 22pt 0 8pt; padding-bottom: 4pt; border-bottom: 1.2pt solid #1f1d1a; }
  .export-portal h1.titulo { font-size: 28pt; border: 0; margin: 0 0 2pt; line-height: 1.1; }
  .export-portal .meta { color: #6b665e; font-size: 9pt; margin: 0 0 14pt; }
  .export-portal h2 { font-family: var(--font-serif), Georgia, serif; font-size: 15pt; margin: 16pt 0 5pt; }
  .export-portal h3 { font-size: 11pt; font-weight: 600; margin: 12pt 0 4pt; }
  .export-portal p { margin: 0 0 6pt; }
  html, body { background: #fff !important; }
  .export-portal ul, .export-portal ol { margin: 0 0 8pt; padding-left: 18pt; }
  .export-portal ol { list-style: decimal; }
  .export-portal ul { list-style: disc; }
  .export-portal ul ul { list-style: circle; }
  .export-portal ul.alternativas { list-style: none; padding-left: 12pt; }
  .export-portal li { margin: 0 0 2pt; }
  .export-portal li > p { margin: 0; }
  .export-portal table { width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; font-size: 9.5pt; break-inside: auto; }
  .export-portal tr { break-inside: avoid; }
  .export-portal th, .export-portal td { border: 0.6pt solid #bfb8ac; padding: 4pt 6pt; vertical-align: top; text-align: left; }
  .export-portal th { background: #efebe3; font-weight: 600; }
  .export-portal th p, .export-portal td p { margin: 0; }
  .export-portal mark { background: #ffe27a; color: inherit; padding: 0 1pt; }
  .export-portal aside.nota { border-left: 2pt solid #2346a8; background: #eef1fa; color: #2346a8; padding: 4pt 8pt; margin: 2pt 0 8pt; break-inside: avoid; }
  .export-portal aside.nota p { margin: 0; }
}`;

const PART_LABELS: { part: ExportPart; label: string }[] = [
  { part: "resumo", label: "Resumo" },
  { part: "mnemonicos", label: "Mnemônicos" },
  { part: "fluxogramas", label: "Fluxogramas" },
  { part: "flashcards", label: "Flashcards" },
  { part: "questoes", label: "Questões com gabarito" },
  { part: "perguntas", label: "Perguntas para refletir" },
];

export function ExportDialog({
  open,
  onOpenChange,
  topicId,
  title,
  summaryHtml,
  flashcards,
  mcq,
  review,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicId: string;
  title: string;
  summaryHtml: string;
  flashcards: ExportInput["flashcards"];
  mcq: ExportInput["mcq"];
  review: string[];
}) {
  const [format, setFormat] = useState<Format>("pdf");
  const [parts, setParts] = useState<Set<ExportPart>>(
    () => new Set(["resumo", "notas", "grifos", "mnemonicos", "fluxogramas", "perguntas"]),
  );
  const [busy, setBusy] = useState(false);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const baseId = useId();

  const notes = useNotes(topicId);
  // Busca o resumo direto do banco ao abrir: a página guarda uma cópia que pode estar
  // alguns minutos atrasada (grifos e edições recentes ficariam de fora)
  const extras = useQuery({
    queryKey: ["export-materiais", topicId],
    enabled: open,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("type, content")
        .eq("topic_id", topicId)
        .in("type", ["summary", "mnemonics", "flowchart"]);
      if (error) throw error;
      const byType = new Map((data ?? []).map((m) => [m.type, m.content]));
      const summary = byType.get("summary") as { html?: string } | undefined;
      return {
        summaryHtml: summary?.html != null ? delatex(summary.html, "html") : null,
        mnemonics: ((byType.get("mnemonics") as { items?: Mnemonic[] } | undefined)?.items ??
          []) as Mnemonic[],
        flows: ((byType.get("flowchart") as Partial<FlowContent> | undefined)?.flows ??
          {}) as FlowContent["flows"],
      };
    },
  });
  const { refetch: refetchExtras } = extras;
  const { refetch: refetchNotes } = notes;
  useEffect(() => {
    if (!open) return;
    void refetchExtras();
    void refetchNotes();
  }, [open, refetchExtras, refetchNotes]);

  const liveSummary = extras.data?.summaryHtml ?? summaryHtml;

  const counts: Record<ExportPart, number> = {
    resumo: liveSummary.replace(/<[^>]+>/g, "").trim() ? 1 : 0,
    notas: notes.data?.length ?? 0,
    grifos: (liveSummary.match(/<mark/g) ?? []).length,
    mnemonicos: extras.data?.mnemonics.length ?? 0,
    fluxogramas: Object.values(extras.data?.flows ?? {}).filter(Boolean).length,
    flashcards: flashcards.length,
    questoes: mcq.length,
    perguntas: review.length,
  };

  const chosen = PART_LABELS.filter((p) => parts.has(p.part) && counts[p.part] > 0);
  const loading = notes.isFetching || extras.isFetching;

  function toggle(part: ExportPart, on: boolean) {
    setParts((prev) => {
      const next = new Set(prev);
      if (on) next.add(part);
      else next.delete(part);
      return next;
    });
  }

  const input = useMemo<ExportInput>(
    () => ({
      title,
      summaryHtml: liveSummary,
      notes: notes.data ?? [],
      mnemonics: extras.data?.mnemonics ?? [],
      flows: extras.data?.flows ?? {},
      flashcards,
      mcq,
      review,
    }),
    [title, liveSummary, notes.data, extras.data, flashcards, mcq, review],
  );

  // PDF: monta o documento no <body>, abre a impressão e limpa depois
  useEffect(() => {
    if (printHtml === null) return;
    const previousTitle = document.title;
    document.title = title; // vira o nome sugerido do PDF
    const done = () => {
      document.title = previousTitle;
      setPrintHtml(null);
    };
    window.addEventListener("afterprint", done, { once: true });
    const t = window.setTimeout(() => window.print(), 80);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
      document.title = previousTitle;
    };
  }, [printHtml, title]);

  async function run() {
    if (!chosen.length) return;
    const html = buildExportHtml(input, parts);
    if (format === "pdf") {
      onOpenChange(false);
      setPrintHtml(html);
      return;
    }
    setBusy(true);
    try {
      const blob = await htmlToDocx(html, title);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileNameFor(title, "docx");
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Arquivo do Word baixado.");
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Não deu para gerar o arquivo do Word.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-[1.6rem] font-normal leading-none">
              Exportar tópico
            </DialogTitle>
            <DialogDescription>
              Escolha o formato e o que entra no arquivo. O PDF sai pela janela de impressão:
              escolha “Salvar como PDF”.
            </DialogDescription>
          </DialogHeader>

          <Segmented
            label="Formato"
            value={format}
            onChange={setFormat}
            options={[
              { value: "pdf", label: "PDF" },
              { value: "docx", label: "Word (.docx)" },
            ]}
          />

          <fieldset className="grid gap-1" aria-busy={loading}>
            <legend className="mb-1 text-sm font-medium">O que incluir</legend>
            {PART_LABELS.map(({ part, label }) => {
              const n = counts[part];
              const disabled = n === 0;
              const id = `${baseId}-${part}`;
              return (
                <div key={part}>
                  <CheckRow
                    id={id}
                    label={label}
                    hint={
                      disabled
                        ? loading
                          ? "carregando…"
                          : "nada ainda"
                        : part === "resumo"
                          ? ""
                          : String(n)
                    }
                    checked={!disabled && parts.has(part)}
                    disabled={disabled}
                    onChange={(on) => toggle(part, on)}
                  />
                  {part === "resumo" && !disabled && parts.has("resumo") && (
                    <div className="ml-7 grid gap-1">
                      <CheckRow
                        id={`${id}-notas`}
                        label="Minhas notas"
                        hint={loading ? "…" : counts.notas ? String(counts.notas) : "nenhuma"}
                        checked={counts.notas > 0 && parts.has("notas")}
                        disabled={counts.notas === 0}
                        onChange={(on) => toggle("notas", on)}
                      />
                      <CheckRow
                        id={`${id}-grifos`}
                        label="Grifos em amarelo"
                        hint={loading ? "…" : counts.grifos ? "" : "nenhum"}
                        checked={counts.grifos > 0 && parts.has("grifos")}
                        disabled={counts.grifos === 0}
                        onChange={(on) => toggle("grifos", on)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={() => void run()} disabled={busy || loading || !chosen.length}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : format === "pdf" ? (
                <Printer className="size-4" aria-hidden />
              ) : (
                <Download className="size-4" aria-hidden />
              )}
              {format === "pdf" ? "Gerar PDF" : busy ? "Gerando…" : "Baixar .docx"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {printHtml !== null &&
        createPortal(
          <div className="export-portal">
            <style>{PRINT_CSS}</style>
            <div dangerouslySetInnerHTML={{ __html: printHtml }} />
          </div>,
          document.body,
        )}
    </>
  );
}

function CheckRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-9 cursor-pointer items-center gap-3 rounded-md px-1 text-[0.9375rem]",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--color-foreground)]"
      />
      <span className="flex-1">{label}</span>
      {hint && <span className="font-mono text-xs text-muted-foreground tnum">{hint}</span>}
    </label>
  );
}
