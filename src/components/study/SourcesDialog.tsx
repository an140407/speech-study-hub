import { useEffect, useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ClipboardPaste,
  FileText,
  FileUp,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AiWait } from "@/components/study/AiWait";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Segmented } from "@/components/study/Segmented";
import { supabase } from "@/integrations/supabase/client";
import { aiErrorMessage, withAiRetry } from "@/lib/ai-busy";
import { ingestSource, prepareSourceUpload } from "@/lib/source.functions";
import {
  escapeHtml,
  insertIntoSummary,
  insertNewSection,
  listSections,
  removeSourceBlocks,
} from "@/lib/summary-sections";
import {
  addTopicSource,
  applyTopicUpdate,
  planTopicUpdate,
  type UpdatePlan,
} from "@/lib/topic-sources.functions";
import {
  fileKind,
  fileSha256,
  removeTopicSource,
  sourceLabel,
  useTopicSources,
  type TopicSourceRow,
} from "@/lib/topic-sources";
import { cn } from "@/lib/utils";

const eyebrow =
  "font-sans text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground";
const field =
  "w-full rounded-md border border-input bg-card px-3 text-[0.9375rem] outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-ring)_18%,transparent)]";
const shell = "flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[760px]";
const bodyClass = "min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-6";
const footerClass =
  "flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background px-6 py-4";
const KIND_LABEL = { pdf: "PDF", pptx: "PPTX", texto: "Texto" } as const;

type View = "lista" | "adicionar" | "atualizar";

export function SourcesDialog({
  open,
  onOpenChange,
  topicId,
  original,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicId: string;
  original: { name: string | null; kind: string | null } | null;
  onApplied: () => Promise<void> | void;
}) {
  const queryClient = useQueryClient();
  const sources = useTopicSources(topicId);
  const [view, setView] = useState<View>("lista");
  const [target, setTarget] = useState<TopicSourceRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (open) setView("lista");
  }, [open]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["topic-sources", topicId] });

  /** Tira do resumo o que a fonte acrescentou e volta a fonte para "não incluída". */
  async function undo(s: TopicSourceRow) {
    setBusy("Desfazendo…");
    try {
      const { data, error } = await supabase
        .from("materials")
        .select("content")
        .eq("topic_id", topicId)
        .eq("type", "summary")
        .maybeSingle();
      if (error) throw new Error("Não deu para ler o resumo atual.");
      const current = String((data?.content as { html?: string } | null)?.html ?? "");
      const { html, removed } = removeSourceBlocks(current, sourceLabel(s.name));
      if (removed) {
        const { error: saveErr } = await supabase
          .from("materials")
          .update({ content: { html } })
          .eq("topic_id", topicId)
          .eq("type", "summary");
        if (saveErr) throw new Error("Não deu para salvar o resumo.");
      }
      await supabase.from("topic_sources").update({ merged_at: null }).eq("id", s.id);
      await refresh();
      await onApplied();
      toast.success(
        removed
          ? `${removed} trecho${removed > 1 ? "s" : ""} da fonte saíram do resumo. Os flashcards e questões criados continuam.`
          : "Não achei trechos dessa fonte no resumo; ela voltou a ficar como não incluída.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para desfazer.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className={shell}>
        {view === "lista" && (
          <SourceList
            topicId={topicId}
            original={original}
            sources={sources.data ?? []}
            loading={sources.isLoading}
            onAdd={() => setView("adicionar")}
            onUpdate={(s) => {
              setTarget(s);
              setView("atualizar");
            }}
            onRemoved={refresh}
            onUndo={(src) => void undo(src)}
            busy={!!busy}
            onClose={() => onOpenChange(false)}
          />
        )}
        {view === "adicionar" && (
          <AddSource
            topicId={topicId}
            busy={busy}
            setBusy={setBusy}
            onBack={() => setView("lista")}
            onAdded={async (id) => {
              const list = (await sources.refetch()).data ?? [];
              const added = list.find((s) => s.id === id) ?? null;
              setTarget(added);
              setView(added ? "atualizar" : "lista");
            }}
          />
        )}
        {view === "atualizar" && target && (
          <UpdateTopic
            topicId={topicId}
            source={target}
            busy={busy}
            setBusy={setBusy}
            onBack={() => setView("lista")}
            onDone={async () => {
              await refresh();
              await onApplied();
              setView("lista");
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Lista --------------------------------- */

function SourceList({
  original,
  sources,
  loading,
  onAdd,
  onUpdate,
  onRemoved,
  onUndo,
  busy,
  onClose,
}: {
  topicId: string;
  original: { name: string | null; kind: string | null } | null;
  sources: TopicSourceRow[];
  loading: boolean;
  onAdd: () => void;
  onUpdate: (s: TopicSourceRow) => void;
  onRemoved: () => void;
  onUndo: (s: TopicSourceRow) => void;
  busy: boolean;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });

  return (
    <>
      <div className={bodyClass}>
        <DialogHeader>
          <DialogTitle className="text-[1.6rem] font-normal leading-none">
            Fontes do tópico
          </DialogTitle>
          <DialogDescription>
            Junte outras aulas, slides ou anotações a este tópico. Ao atualizar, a IA acrescenta ao
            resumo só o que a fonte nova traz de diferente, sem reescrever o que você já tem.
          </DialogDescription>
        </DialogHeader>

        <ul className="mt-5 divide-y divide-border border-y border-border">
          <li className="flex items-center gap-3 py-3">
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className={eyebrow}>Fonte principal</p>
              <p className="truncate">
                {original?.name ? sourceLabel(original.name) : "Criado a partir do título"}
              </p>
            </div>
          </li>
          {loading ? (
            <li className="py-4">
              <div className="h-5 w-1/2 animate-pulse rounded bg-foreground/[0.06]" />
            </li>
          ) : (
            sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className={eyebrow}>
                    {KIND_LABEL[s.kind]} · {Math.max(1, Math.round(s.chars / 1000))} mil caracteres
                  </p>
                  <p className="truncate">{sourceLabel(s.name)}</p>
                  <p
                    className={cn(
                      "text-xs",
                      s.merged_at ? "text-muted-foreground" : "text-tint-4-fg",
                    )}
                  >
                    {s.merged_at
                      ? `Incluída no tópico em ${date(s.merged_at)}`
                      : "Ainda não incluída no tópico"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {s.merged_at &&
                    (undoing === s.id ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        autoFocus
                        disabled={busy}
                        onBlur={() => setUndoing(null)}
                        onClick={() => {
                          setUndoing(null);
                          onUndo(s);
                        }}
                      >
                        Tirar do resumo?
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setUndoing(s.id)}
                        title="Tira do resumo os trechos que esta fonte acrescentou"
                      >
                        <Undo2 className="size-4" aria-hidden /> Desfazer
                      </Button>
                    ))}
                  <Button
                    size="sm"
                    variant={s.merged_at ? "ghost" : "default"}
                    disabled={busy}
                    onClick={() => onUpdate(s)}
                  >
                    <RefreshCw className="size-4" aria-hidden />
                    {s.merged_at ? "Comparar de novo" : "Atualizar tópico"}
                  </Button>
                  {confirming === s.id ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      autoFocus
                      onBlur={() => setConfirming(null)}
                      onClick={async () => {
                        try {
                          await removeTopicSource(s.id);
                          onRemoved();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Não deu para remover.");
                        } finally {
                          setConfirming(null);
                        }
                      }}
                    >
                      Remover?
                    </Button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Remover a fonte ${sourceLabel(s.name)}`}
                      onClick={() => setConfirming(s.id)}
                      className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
              </li>
            ))
          )}
        </ul>
        {!loading && sources.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            “Desfazer” tira do resumo os trechos que a fonte acrescentou. Remover a fonte (lixeira)
            não mexe no resumo.
          </p>
        )}
      </div>
      <div className={footerClass}>
        <Button variant="outline" onClick={onClose}>
          Fechar
        </Button>
        <Button onClick={onAdd}>
          <Plus className="size-4" aria-hidden /> Adicionar fonte
        </Button>
      </div>
    </>
  );
}

/* -------------------------------- Adicionar -------------------------------- */

function AddSource({
  topicId,
  busy,
  setBusy,
  onBack,
  onAdded,
}: {
  topicId: string;
  busy: string | null;
  setBusy: (s: string | null) => void;
  onBack: () => void;
  onAdded: (id: string) => Promise<void>;
}) {
  const prepareUpload = useServerFn(prepareSourceUpload);
  const ingest = useServerFn(ingestSource);
  const add = useServerFn(addTopicSource);
  const [mode, setMode] = useState<"arquivo" | "texto">("arquivo");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileId = useId();
  const nameId = useId();
  const textId = useId();

  const waitMsg = (wait: number) =>
    setBusy(`A IA está congestionada. Tentando de novo em ${wait} s…`);

  function pick(f: File | null) {
    setError(null);
    if (!f) return;
    if (!fileKind(f)) return setError("Envie um arquivo PDF ou PPTX.");
    if (f.size > 50 * 1024 * 1024) return setError("Arquivo muito grande: o limite é 50 MB.");
    setFile(f);
  }

  async function submit() {
    setError(null);
    try {
      let id: string;
      if (mode === "arquivo") {
        if (!file) return setError("Escolha um arquivo.");
        const kind = fileKind(file)!;
        setBusy("Enviando o arquivo…");
        const hash = await fileSha256(file);
        const prep = await prepareUpload({ data: { hash, kind, size: file.size } });
        const { error: upErr } = await supabase.storage
          .from("source-files")
          .uploadToSignedUrl(prep.path, prep.token, file, {
            contentType:
              kind === "pdf"
                ? "application/pdf"
                : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          });
        if (upErr) throw new Error("Falha ao enviar o arquivo. Tente de novo.");
        setBusy("Preparando o arquivo…");
        const ing = await withAiRetry(
          () => ingest({ data: { hash, kind, keep: false, upload_path: prep.path } }),
          waitMsg,
        );
        setBusy(kind === "pdf" ? "Lendo o PDF. Pode levar até 1 minuto…" : "Guardando o conteúdo…");
        const res = await withAiRetry(
          () =>
            add({
              data: {
                topic_id: topicId,
                kind,
                name: file.name,
                text: ing.text,
                file_uri: ing.file_uri,
              },
            }),
          waitMsg,
        );
        id = res.id;
      } else {
        if (text.trim().length < 80)
          return setError("Cole um texto maior (pelo menos alguns parágrafos).");
        setBusy("Guardando o texto…");
        const res = await add({
          data: {
            topic_id: topicId,
            kind: "texto",
            name: name.trim() || "Texto colado",
            text: text.trim(),
            file_uri: null,
          },
        });
        id = res.id;
      }
      toast.success("Fonte adicionada.");
      await onAdded(id);
    } catch (e) {
      setError(aiErrorMessage(e, "Não deu para adicionar a fonte."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className={bodyClass}>
        <DialogHeader>
          <DialogTitle className="text-[1.6rem] font-normal leading-none">
            Adicionar fonte
          </DialogTitle>
          <DialogDescription>
            Outra aula, slides do professor ou suas anotações de aula sobre o mesmo tema.
          </DialogDescription>
        </DialogHeader>

        <Segmented
          label="Tipo de fonte"
          value={mode}
          onChange={(v) => {
            setMode(v);
            setError(null);
          }}
          options={[
            { value: "arquivo", label: "Arquivo (PDF ou PPTX)" },
            { value: "texto", label: "Colar texto" },
          ]}
          className="mt-5"
        />

        {mode === "arquivo" ? (
          <label
            htmlFor={fileId}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files?.[0] ?? null);
            }}
            className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border px-5 py-8 text-center transition-colors hover:border-foreground/40"
          >
            <FileUp className="size-5 text-muted-foreground" aria-hidden />
            <span className="text-[0.9375rem]">
              {file ? file.name : "Escolha ou arraste um PDF ou PPTX"}
            </span>
            <span className="text-xs text-muted-foreground">Até 50 MB</span>
            <input
              id={fileId}
              type="file"
              accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="sr-only"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
          </label>
        ) : (
          <div className="mt-4 grid gap-3">
            <div className="grid gap-1.5">
              <label htmlFor={nameId} className="text-sm font-medium">
                Nome da fonte
              </label>
              <input
                id={nameId}
                value={name}
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Anotações da aula de quinta"
                className={cn(field, "h-11")}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={textId} className="text-sm font-medium">
                Texto
              </label>
              <textarea
                id={textId}
                value={text}
                rows={9}
                onChange={(e) => setText(e.target.value)}
                placeholder="Cole aqui o conteúdo."
                className={cn(field, "min-h-40 resize-y py-2 leading-relaxed")}
              />
            </div>
          </div>
        )}

        <p
          aria-live="polite"
          className={cn(
            "mt-3 flex items-center gap-2 text-sm",
            error ? "text-destructive" : "sr-only",
          )}
        >
          {error ?? busy ?? ""}
        </p>
        {/* Visível: círculo girando, a etapa atual e há quanto tempo está esperando */}
        <AiWait active={!!busy && !error} label={busy ?? ""} className="mt-3" />
      </div>
      <div className={footerClass}>
        <Button variant="ghost" className="mr-auto" onClick={onBack} disabled={!!busy}>
          <ArrowLeft className="size-4" aria-hidden /> Voltar
        </Button>
        <Button onClick={() => void submit()} disabled={!!busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : mode === "arquivo" ? (
            <FileUp className="size-4" aria-hidden />
          ) : (
            <ClipboardPaste className="size-4" aria-hidden />
          )}
          Adicionar e comparar
        </Button>
      </div>
    </>
  );
}

/* -------------------------------- Atualizar -------------------------------- */

function UpdateTopic({
  topicId,
  source,
  busy,
  setBusy,
  onBack,
  onDone,
}: {
  topicId: string;
  source: TopicSourceRow;
  busy: string | null;
  setBusy: (s: string | null) => void;
  onBack: () => void;
  onDone: () => Promise<void>;
}) {
  const plan = useServerFn(planTopicUpdate);
  const apply = useServerFn(applyTopicUpdate);
  const [result, setResult] = useState<UpdatePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipAdd, setSkipAdd] = useState<Set<number>>(new Set());
  const [skipSec, setSkipSec] = useState<Set<number>>(new Set());
  const [withCards, setWithCards] = useState(true);
  const [withQuestions, setWithQuestions] = useState(true);
  const label = sourceLabel(source.name);

  async function run() {
    setError(null);
    setResult(null);
    setBusy("Comparando a fonte com o seu resumo…");
    try {
      const r = await withAiRetry(
        () => plan({ data: { topic_id: topicId, source_id: source.id } }),
        (wait) => setBusy(`A IA está congestionada. Tentando de novo em ${wait} s…`),
      );
      setResult(r);
      setSkipAdd(new Set());
      setSkipSec(new Set());
    } catch (e) {
      setError(aiErrorMessage(e, "Não deu para comparar a fonte."));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.id]);

  const additions = result?.additions ?? [];
  const sections = result?.sections ?? [];
  const count =
    additions.length -
    skipAdd.size +
    (sections.length - skipSec.size) +
    (withCards ? (result?.flashcards.length ?? 0) : 0) +
    (withQuestions ? (result?.questions.length ?? 0) : 0);
  const empty =
    result &&
    !additions.length &&
    !sections.length &&
    !result.flashcards.length &&
    !result.questions.length;

  async function confirm() {
    if (!result) return;
    setBusy("Atualizando o tópico…");
    setError(null);
    try {
      const chosen = additions.filter((_, i) => !skipAdd.has(i));
      const chosenSections = sections.filter((_, i) => !skipSec.has(i));
      if (chosen.length || chosenSections.length) {
        // Parte do resumo salvo agora (não da cópia da página), para não perder nada recente
        const { data, error: readErr } = await supabase
          .from("materials")
          .select("content")
          .eq("topic_id", topicId)
          .eq("type", "summary")
          .maybeSingle();
        if (readErr) throw new Error("Não deu para ler o resumo atual.");
        let html = String((data?.content as { html?: string } | null)?.html ?? "");
        const current = listSections(html);
        // Junta os acréscimos de cada seção num bloco só, com o nome da fonte
        const bySection = new Map<number, string[]>();
        for (const a of chosen) {
          let idx = current.findIndex((s) => s.title === a.title);
          if (idx < 0 && a.section < current.length) idx = a.section;
          if (idx < 0) continue;
          (bySection.get(idx) ?? bySection.set(idx, []).get(idx)!).push(a.html);
        }
        for (const [idx, parts] of bySection) {
          html = insertIntoSummary(
            html,
            idx,
            `<h3>Complemento: ${escapeHtml(label)}</h3>${parts.join("")}`,
          );
        }
        for (const s of chosenSections) {
          html = insertNewSection(
            html,
            s.title,
            `<p><em>Da fonte “${escapeHtml(label)}”.</em></p>${s.html}`,
          );
        }
        const { error: saveErr } = await supabase
          .from("materials")
          .update({ content: { html } })
          .eq("topic_id", topicId)
          .eq("type", "summary");
        if (saveErr) throw new Error("Não deu para salvar o resumo.");
      }
      await apply({
        data: {
          topic_id: topicId,
          source_id: source.id,
          flashcards: withCards ? result.flashcards : [],
          questions: withQuestions ? result.questions : [],
        },
      });
      toast.success(empty ? "Fonte marcada como incluída." : "Tópico atualizado.");
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não deu para atualizar o tópico.");
    } finally {
      setBusy(null);
    }
  }

  const toggle = (set: Set<number>, i: number, on: boolean) => {
    const next = new Set(set);
    if (on) next.delete(i);
    else next.add(i);
    return next;
  };

  return (
    <>
      <div className={bodyClass}>
        <DialogHeader>
          <DialogTitle className="text-[1.6rem] font-normal leading-none">
            Atualizar com “{label}”
          </DialogTitle>
          <DialogDescription>
            Confira o que a fonte acrescenta. Desmarque o que não quiser; nada muda até você
            aplicar.
          </DialogDescription>
        </DialogHeader>

        <p
          aria-live="polite"
          className={cn(
            "mt-4 flex items-center gap-2 text-sm",
            error ? "text-destructive" : "sr-only",
          )}
        >
          {error ?? busy ?? ""}
        </p>
        {/* Visível: círculo girando, a etapa atual e há quanto tempo está esperando */}
        <AiWait active={!!busy && !error} label={busy ?? ""} className="mt-3" />

        {!result && busy && (
          <div className="mt-4 grid gap-3" aria-hidden>
            {[72, 120, 96].map((h, i) => (
              <div
                key={i}
                className="animate-pulse rounded-lg bg-foreground/[0.05]"
                style={{ height: h, animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
        )}

        {result && (
          <div className="mt-4 grid gap-6">
            {result.summary && (
              <p className="border-l-2 border-foreground/20 pl-3 text-[0.98rem] leading-relaxed">
                {result.summary}
              </p>
            )}
            {empty && (
              <p className="rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                Essa fonte não traz nada novo em relação ao seu resumo. Você pode marcá-la como
                incluída mesmo assim.
              </p>
            )}

            {additions.length > 0 && (
              <section aria-labelledby="acrescimos">
                <h3 id="acrescimos" className={eyebrow}>
                  Acréscimos ao resumo
                </h3>
                <ul className="mt-2 grid gap-3">
                  {additions.map((a, i) => (
                    <PreviewItem
                      key={i}
                      checked={!skipAdd.has(i)}
                      onChange={(on) => setSkipAdd((s) => toggle(s, i, on))}
                      kicker={`Em: ${a.title || `seção ${a.section + 1}`}`}
                      html={a.html}
                    />
                  ))}
                </ul>
              </section>
            )}

            {sections.length > 0 && (
              <section aria-labelledby="secoes-novas">
                <h3 id="secoes-novas" className={eyebrow}>
                  Seções novas
                </h3>
                <ul className="mt-2 grid gap-3">
                  {sections.map((s, i) => (
                    <PreviewItem
                      key={i}
                      checked={!skipSec.has(i)}
                      onChange={(on) => setSkipSec((x) => toggle(x, i, on))}
                      kicker={`Seção nova: ${s.title}`}
                      html={s.html}
                    />
                  ))}
                </ul>
              </section>
            )}

            {(result.flashcards.length > 0 || result.questions.length > 0) && (
              <section aria-labelledby="praticar" className="grid gap-2">
                <h3 id="praticar" className={eyebrow}>
                  Para praticar
                </h3>
                {result.flashcards.length > 0 && (
                  <ExtraGroup
                    label={`Adicionar ${result.flashcards.length} flashcard${result.flashcards.length > 1 ? "s" : ""}`}
                    checked={withCards}
                    onChange={setWithCards}
                    items={result.flashcards.map((f) => `${f.front} → ${f.back}`)}
                  />
                )}
                {result.questions.length > 0 && (
                  <ExtraGroup
                    label={`Adicionar ${result.questions.length} quest${result.questions.length > 1 ? "ões" : "ão"}`}
                    checked={withQuestions}
                    onChange={setWithQuestions}
                    items={result.questions.map(
                      (q) => q.question.split("\n\n").pop() ?? q.question,
                    )}
                  />
                )}
              </section>
            )}
          </div>
        )}
      </div>
      <div className={footerClass}>
        <Button variant="ghost" className="mr-auto" onClick={onBack} disabled={!!busy}>
          <ArrowLeft className="size-4" aria-hidden /> Agora não
        </Button>
        {error && !result && (
          <Button variant="outline" onClick={() => void run()} disabled={!!busy}>
            Tentar de novo
          </Button>
        )}
        {result && (
          <Button onClick={() => void confirm()} disabled={!!busy || (!empty && count === 0)}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {empty ? "Marcar como incluída" : `Aplicar ao tópico (${count})`}
          </Button>
        )}
      </div>
    </>
  );
}

function PreviewItem({
  checked,
  onChange,
  kicker,
  html,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  kicker: string;
  html: string;
}) {
  const id = useId();
  return (
    <li
      className={cn(
        "rounded-lg border px-4 py-3 transition-colors",
        checked ? "border-border bg-card" : "border-dashed border-border opacity-60",
      )}
    >
      <label htmlFor={id} className="flex cursor-pointer items-center gap-2.5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 accent-[var(--color-foreground)]"
        />
        <span className="text-sm font-medium">{kicker}</span>
      </label>
      <div
        className="resumo-editor prose-study mt-2 overflow-x-auto text-[0.95rem] [&>:last-child]:mb-0"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </li>
  );
}

function ExtraGroup({
  label,
  checked,
  onChange,
  items,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  items: string[];
}) {
  const id = useId();
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <label htmlFor={id} className="flex cursor-pointer items-center gap-2.5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 accent-[var(--color-foreground)]"
        />
        <span className="text-sm font-medium">{label}</span>
      </label>
      <details className="mt-1.5 pl-6.5 text-sm text-muted-foreground">
        <summary className="cursor-pointer select-none">Ver quais</summary>
        <ol className="mt-1.5 list-decimal space-y-1 pl-5">
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}
