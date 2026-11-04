import { useEffect, useId, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Loader2, MessageSquareText, Sparkles, Table2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AiWait } from "@/components/study/AiWait";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { aiErrorMessage, withAiRetry } from "@/lib/ai-busy";
import { cn } from "@/lib/utils";
import {
  escapeHtml,
  glossaryIndex,
  insertIntoSummary,
  insertNewSection,
  listSections,
} from "@/lib/summary-sections";
import { compareTable, reexplainSection } from "@/lib/summary-tools.functions";

const field =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-[0.9375rem] outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-ring)_18%,transparent)]";
const labelClass = "text-sm font-medium";
/** Janela com corpo rolando e rodapé fixo: os botões ficam sempre à vista. */
const shell = "flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0";
const bodyClass = "min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-6";
const footerClass = "border-t border-border bg-background px-6 py-4";

/** Grava o resumo com o bloco novo e avisa a página para recarregar o editor. */
async function saveSummary(topicId: string, html: string) {
  const { error } = await supabase
    .from("materials")
    .update({ content: { html } })
    .eq("topic_id", topicId)
    .eq("type", "summary");
  if (error) throw new Error("Não deu para salvar no resumo. Tente de novo.");
}

/** Menu "Ferramentas IA" do resumo (modo leitura): tabela comparativa e explicar uma seção de novo. */
export function SummaryTools({
  topicId,
  html,
  onChanged,
}: {
  topicId: string;
  html: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<"tabela" | "explicar" | null>(null);
  const sections = useMemo(() => (typeof window === "undefined" ? [] : listSections(html)), [html]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-9 text-sm">
            <Sparkles className="size-4" aria-hidden /> Ferramentas IA
            <ChevronDown className="size-3.5 opacity-60" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={() => setOpen("tabela")} className="gap-2">
            <Table2 className="size-4" aria-hidden /> Tabela comparativa
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setOpen("explicar")}
            className="gap-2"
            disabled={!sections.length}
          >
            <MessageSquareText className="size-4" aria-hidden /> Explicar uma seção de novo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CompareDialog
        open={open === "tabela"}
        onOpenChange={(o) => setOpen(o ? "tabela" : null)}
        topicId={topicId}
        html={html}
        sections={sections}
        onChanged={onChanged}
      />
      <ExplainDialog
        open={open === "explicar"}
        onOpenChange={(o) => setOpen(o ? "explicar" : null)}
        topicId={topicId}
        html={html}
        sections={sections}
        onChanged={onChanged}
      />
    </>
  );
}

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicId: string;
  html: string;
  sections: { index: number; title: string; text: string }[];
  onChanged: () => void;
};

function PlaceSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="h-11 bg-card text-[0.9375rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-[min(22rem,var(--radix-select-content-available-height))]">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="py-2 text-[0.9375rem]">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CompareDialog({ open, onOpenChange, topicId, html, sections, onChanged }: DialogProps) {
  const generate = useServerFn(compareTable);
  const queryId = useId();
  const placeId = useId();
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState("nova");
  const [busy, setBusy] = useState<"gerando" | "salvando" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; html: string } | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setResult(null);
      setPlace("nova");
    }
  }, [open]);

  const glossary = glossaryIndex(sections);
  const placeOptions = [
    {
      value: "nova",
      label:
        glossary >= 0
          ? `Seção nova, antes de “${sections[glossary]!.title.replace(/^\s*\d+\.\s*/, "")}”`
          : "Seção nova, no fim do resumo",
    },
    ...sections.map((s) => ({ value: String(s.index), label: `Dentro de: ${s.title}` })),
  ];

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 3) {
      setError("Diga o que comparar, por exemplo: perda condutiva × neurossensorial.");
      return;
    }
    setError(null);
    setBusy("gerando");
    try {
      setResult(
        await withAiRetry(
          () => generate({ data: { topic_id: topicId, query: query.trim() } }),
          (wait) => setNote(`A IA está congestionada. Tentando de novo em ${wait} s…`),
        ),
      );
    } catch (err) {
      setError(aiErrorMessage(err, "Não deu para montar a tabela."));
    } finally {
      setNote(null);
      setBusy(null);
    }
  }

  async function insert() {
    if (!result) return;
    setBusy("salvando");
    try {
      const next =
        place === "nova"
          ? insertNewSection(html, result.title, result.html)
          : insertIntoSummary(
              html,
              Number(place),
              `<h3>${escapeHtml(result.title)}</h3>${result.html}`,
            );
      await saveSummary(topicId, next);
      toast.success("Tabela inserida no resumo.");
      onOpenChange(false);
      setQuery("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não deu para salvar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className={cn(shell, "sm:max-w-[720px]")}>
        <div className={bodyClass}>
          <DialogHeader>
            <DialogTitle className="text-[1.6rem] font-normal leading-none">
              Tabela comparativa
            </DialogTitle>
            <DialogDescription>
              A IA monta a tabela com os critérios que mais diferenciam os itens. Você confere antes
              de inserir.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={run} className="mt-5 grid gap-2">
            <label htmlFor={queryId} className={labelClass}>
              O que comparar?
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id={queryId}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={200}
                autoComplete="off"
                placeholder="Ex.: perda condutiva × neurossensorial, ou tipos de afasia…"
                className={field}
              />
              <Button type="submit" disabled={!!busy} className="h-11 shrink-0">
                {busy === "gerando" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="size-4" aria-hidden />
                )}
                {busy === "gerando" ? "Montando…" : result ? "Gerar de novo" : "Gerar tabela"}
              </Button>
            </div>
            <p aria-live="polite" className={cn("text-sm", error ? "text-destructive" : "sr-only")}>
              {error ?? note ?? (busy === "gerando" ? "Montando a tabela." : "")}
            </p>
            <AiWait active={busy === "gerando" && !error} label={note ?? "Montando a tabela"} />
          </form>

          {result && (
            <div className="mt-3 border-t border-border pt-4">
              <p className="font-serif text-[1.35rem] leading-tight">{result.title}</p>
              <div
                className="resumo-editor prose-study mt-3 overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: result.html }}
              />
            </div>
          )}
        </div>

        <div className={footerClass}>
          {result && (
            <div className="mb-3 grid gap-1.5">
              <label htmlFor={placeId} className={labelClass}>
                Onde inserir
              </label>
              <PlaceSelect id={placeId} value={place} onChange={setPlace} options={placeOptions} />
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!!busy}
              onClick={() => onOpenChange(false)}
            >
              {result ? "Descartar" : "Cancelar"}
            </Button>
            {result && (
              <Button type="button" disabled={!!busy} onClick={() => void insert()}>
                {busy === "salvando" ? "Inserindo…" : "Inserir no resumo"}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const MODES = [
  { v: "simples", label: "Mais simples", heading: "Em outras palavras" },
  { v: "fundo", label: "Mais a fundo", heading: "Aprofundando" },
  { v: "clinico", label: "Com exemplo clínico", heading: "Na prática clínica" },
] as const;

/** "Aprofundando: mecanismo dos glicocorticoides" (minúscula só se não for sigla). */
function headingFor(base: string, title: string) {
  if (!title) return base;
  const t = /^\p{Lu}\p{Ll}/u.test(title) ? title.charAt(0).toLowerCase() + title.slice(1) : title;
  return `${base}: ${t}`;
}

function ExplainDialog({ open, onOpenChange, topicId, html, sections, onChanged }: DialogProps) {
  const explain = useServerFn(reexplainSection);
  const sectionId = useId();
  const focusId = useId();
  const modeName = useId();
  const [section, setSection] = useState("0");
  const [mode, setMode] = useState<(typeof MODES)[number]["v"]>("simples");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState<"gerando" | "salvando" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<{ html: string; title: string } | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setResult(null);
    }
  }, [open]);

  const chosen = sections[Number(section)];
  const heading = headingFor(MODES.find((m) => m.v === mode)!.heading, result?.title ?? "");

  async function run() {
    if (!chosen) return;
    setError(null);
    setBusy("gerando");
    try {
      const f = focus.trim();
      setResult(
        await withAiRetry(
          () =>
            explain({
              data: {
                topic_id: topicId,
                section_title: chosen.title,
                section_text: chosen.text.slice(0, 12000) || chosen.title,
                mode,
                ...(f ? { focus: f.slice(0, 160) } : {}),
              },
            }),
          (wait) => setNote(`A IA está congestionada. Tentando de novo em ${wait} s…`),
        ),
      );
    } catch (err) {
      setError(aiErrorMessage(err, "Não deu para explicar esta seção."));
    } finally {
      setNote(null);
      setBusy(null);
    }
  }

  async function insert() {
    if (!result || !chosen) return;
    setBusy("salvando");
    try {
      await saveSummary(
        topicId,
        insertIntoSummary(html, chosen.index, `<h3>${escapeHtml(heading)}</h3>${result.html}`),
      );
      toast.success(`Explicação inserida em “${chosen.title}”.`);
      onOpenChange(false);
      setFocus("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não deu para salvar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className={cn(shell, "sm:max-w-[640px]")}>
        <div className={bodyClass}>
          <DialogHeader>
            <DialogTitle className="text-[1.6rem] font-normal leading-none">
              Explicar de novo
            </DialogTitle>
            <DialogDescription>
              Escolha a seção que não ficou clara e como quer a nova explicação. Ler não muda o
              resumo; só inserir.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid gap-1.5">
            <label htmlFor={sectionId} className={labelClass}>
              Seção
            </label>
            <PlaceSelect
              id={sectionId}
              value={section}
              onChange={(v) => {
                setSection(v);
                setResult(null);
              }}
              options={sections.map((s) => ({ value: String(s.index), label: s.title }))}
            />
          </div>

          <fieldset className="mt-4">
            <legend className={labelClass}>Como explicar</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {MODES.map((m) => (
                <label
                  key={m.v}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border px-3 text-sm transition-colors",
                    mode === m.v ? "border-foreground" : "border-border hover:border-foreground/40",
                  )}
                >
                  <input
                    type="radio"
                    name={modeName}
                    value={m.v}
                    checked={mode === m.v}
                    onChange={() => {
                      setMode(m.v);
                      setResult(null);
                    }}
                    className="size-4 accent-[var(--color-foreground)]"
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-4 grid gap-1.5">
            <label htmlFor={focusId} className={labelClass}>
              Foco <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <input
              id={focusId}
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              maxLength={160}
              autoComplete="off"
              placeholder="Ex.: glicocorticoides, ou drenagem de abscesso…"
              className={field}
            />
          </div>

          <p
            aria-live="polite"
            className={cn("mt-2 text-sm", error ? "text-destructive" : "sr-only")}
          >
            {error ?? note ?? (busy === "gerando" ? "Escrevendo a explicação." : "")}
          </p>
          <AiWait
            active={busy === "gerando" && !error}
            label={note ?? "Escrevendo a explicação"}
            className="mt-2"
          />

          {result && (
            <div className="mt-3 rounded-lg border border-border bg-card px-4 py-3">
              <p className="font-sans text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {heading}
              </p>
              <div className="prose-study mt-1" dangerouslySetInnerHTML={{ __html: result.html }} />
            </div>
          )}
        </div>

        <div className={footerClass}>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!!busy}
              onClick={() => onOpenChange(false)}
            >
              Fechar
            </Button>
            {result ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => void run()}
                >
                  {busy === "gerando" ? "Explicando…" : "Gerar de novo"}
                </Button>
                <Button type="button" disabled={!!busy} onClick={() => void insert()}>
                  {busy === "salvando" ? "Inserindo…" : "Inserir no fim da seção"}
                </Button>
              </>
            ) : (
              <Button type="button" disabled={!!busy || !chosen} onClick={() => void run()}>
                {busy === "gerando" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="size-4" aria-hidden />
                )}
                {busy === "gerando" ? "Explicando…" : "Explicar"}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
