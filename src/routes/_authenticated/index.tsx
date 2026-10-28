import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Ellipsis,
  FileText,
  Loader2,
  Paperclip,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateMaterial } from "@/lib/study.functions";
import {
  createTopicFromSource,
  deleteTopic,
  ingestSource,
  pollTopicConversion,
  prepareSourceUpload,
  startTopicConversion,
  transcribeTopicSource,
} from "@/lib/source.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { aiErrorMessage, withAiRetry } from "@/lib/ai-busy";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  cleanTitle,
  progressPct,
  shortDate,
  useTopicsList,
  useTopicsProgress,
} from "@/lib/topics-index";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "FonoLab — Material de estudo de Fonoaudiologia com IA" },
      {
        name: "description",
        content:
          "Digite um tema de Fonoaudiologia ou envie a aula e receba resumo, esquema, flashcards, questões e caso clínico.",
      },
      { property: "og:title", content: "FonoLab — Estude Fonoaudiologia com IA" },
      {
        property: "og:description",
        content: "Resumos, flashcards, questões e casos clínicos gerados por IA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const EXAMPLES = [
  "Paralisia facial periférica",
  "Disfagia orofaríngea",
  "Gagueira do desenvolvimento",
  "Presbiacusia",
];

function Index() {
  const [topic, setTopic] = useState("");
  const [attachedFile, setAttachedFile] = useState<{ file: File; kind: "pdf" | "pptx" } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [keepFile, setKeepFile] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const generate = useServerFn(generateMaterial);
  const prepareUpload = useServerFn(prepareSourceUpload);
  const ingest = useServerFn(ingestSource);
  const createTopic = useServerFn(createTopicFromSource);
  const transcribe = useServerFn(transcribeTopicSource);
  const startConversion = useServerFn(startTopicConversion);
  const pollConversion = useServerFn(pollTopicConversion);

  /** Converte o PPTX em segundo plano (o tópico já abriu). Grandes: acompanha o job a cada 5s, até 10 min. */
  async function convertInBackground(topicId: string, hash: string, uploadPath: string) {
    const key = ["source-pending", topicId];
    queryClient.setQueryData(key, true);
    try {
      const input = { topic_id: topicId, hash, upload_path: uploadPath };
      const started = await startConversion({ data: input });
      if (started.status === "pending" && started.job_id) {
        const deadline = Date.now() + 10 * 60 * 1000;
        let done = false;
        while (!done) {
          if (Date.now() > deadline) throw new Error("a conversão demorou demais");
          await new Promise((r) => setTimeout(r, 5000));
          done =
            (await pollConversion({ data: { ...input, job_id: started.job_id } })).status ===
            "done";
        }
      }
      toast.success("Material original pronto — já dá pra ver junto do resumo.");
    } catch (e) {
      toast.warning(
        `Não foi possível converter o PPTX pra PDF (${e instanceof Error ? e.message : "erro desconhecido"}). O tópico continua normal, só sem a prévia do material.`,
      );
    } finally {
      queryClient.setQueryData(key, false);
      queryClient.invalidateQueries({ queryKey: ["topic", topicId] });
    }
  }
  const removeTopic = useServerFn(deleteTopic);

  const [search, setSearch] = useState("");

  const topics = useTopicsList();
  const progress = useTopicsProgress();
  const [dragging, setDragging] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDeleteTopic() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeTopic({ data: { topic_id: deleteTarget.id } });
    } catch {
      setDeleting(false);
      toast.error("Falha ao excluir o tópico.");
      return;
    }
    setDeleting(false);
    toast.success("Tópico excluído.");
    setDeleteTarget(null);
    queryClient.invalidateQueries({ queryKey: ["topics"] });
    queryClient.invalidateQueries({ queryKey: ["topics-progress"] });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return (topics.data ?? [])
      .map((t) => ({ ...t, label: cleanTitle(t.title) }))
      .filter((t) => !q || t.label.replace(/\u00A0/g, " ").toLocaleLowerCase("pt-BR").includes(q));
  }, [topics.data, search]);

  const totals = progress.data?.totals;
  const fcPct = totals?.fcTotal ? Math.round((totals.fcSeen * 100) / totals.fcTotal) : 0;
  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  function handlePickFile(file: File | null) {
    if (!file) return;
    const name = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
    const isPptx =
      file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      name.endsWith(".pptx");
    if (!isPdf && !isPptx) {
      toast.error("Envie um arquivo PDF ou PPTX.");
      return;
    }
    const maxBytes = 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error("Arquivo muito grande — o limite é 50MB.");
      return;
    }
    setTopic("");
    setAttachedFile({ file, kind: isPdf ? "pdf" : "pptx" });
  }

  async function sha256Hex(file: File): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /** Envia o arquivo direto pro Storage (se ainda não existir cópia idêntica) e gera o material. */
  async function generateFromFile(file: File, kind: "pdf" | "pptx") {
    setStage("Lendo o arquivo…");
    const hash = await sha256Hex(file);
    const prep = await prepareUpload({ data: { hash, kind, size: file.size } });
    setStage("Enviando o arquivo…");
    const { error } = await supabase.storage
      .from("source-files")
      .uploadToSignedUrl(prep.path, prep.token, file, {
        contentType:
          kind === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
    if (error) throw new Error("Falha ao enviar o arquivo. Tente de novo.");
    const uploadPath = prep.path;
    setStage("Preparando o arquivo…");
    const ing = await withAiRetry(
      () => ingest({ data: { hash, kind, keep: keepFile, upload_path: uploadPath } }),
      (wait) => onAiBusy(wait, "Preparando o arquivo…"),
    );
    if (ing.warning) toast.warning(ing.warning);

    setStage("Gerando o material…");
    const res = await withAiRetry(
      () =>
        createTopic({
          data: {
            hash,
            kind,
            name: file.name,
            keep: keepFile,
            file_uri: ing.file_uri,
            text: ing.text,
          },
        }),
      (wait) => onAiBusy(wait, "Gerando o material…"),
    );

    // Conversão do PPTX e transcrição da aula em segundo plano (não travam a abertura do tópico).
    if (ing.convert_path) void convertInBackground(res.topic_id, hash, ing.convert_path);
    if (res.needs_transcription && ing.file_uri) {
      const fileUri = ing.file_uri;
      withAiRetry(() => transcribe({ data: { topic_id: res.topic_id, file_uri: fileUri } })).catch(
        (e) => console.error("Transcrição em segundo plano falhou", e),
      );
    }
    return res;
  }

  /** IA congestionada: avisa e mostra a espera; o withAiRetry tenta de novo sozinho. */
  function onAiBusy(waitSeconds: number, nextStage: string) {
    toast.info(
      `O servidor da IA está congestionado — tentando de novo em ${waitSeconds}s. Pode demorar alguns segundos a mais.`,
    );
    setStage(`Servidor da IA congestionado, tentando de novo em ${waitSeconds}s…`);
    setTimeout(() => setStage(nextStage), waitSeconds * 1000);
  }

  async function handleGenerate(e?: React.FormEvent) {
    e?.preventDefault();
    if (!attachedFile) {
      const t = topic.trim();
      if (t.length < 3) {
        toast.error("Digite um tema com pelo menos 3 letras, ou anexe um PDF/PPTX.");
        return;
      }
    }
    setLoading(true);
    try {
      const res = attachedFile
        ? await generateFromFile(attachedFile.file, attachedFile.kind)
        : await withAiRetry(
            () => generate({ data: { topic: topic.trim() } }),
            (wait) => onAiBusy(wait, "Gerando o material…"),
          );
      await queryClient.invalidateQueries({ queryKey: ["topics"] });
      toast.success("Material gerado!");
      navigate({ to: "/topico/$id", params: { id: res.topic_id } });
    } catch (err) {
      toast.error(aiErrorMessage(err, "Falha ao gerar o material."));
    } finally {
      setLoading(false);
      setStage(null);
    }
  }

  return (
    <main
      className="mx-auto w-full max-w-[880px] px-5 pb-24 pt-8 sm:px-8 lg:pt-14"
      onDragOver={(e) => {
        if (loading || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files?.length) return;
        e.preventDefault();
        setDragging(false);
        if (!loading) handlePickFile(e.dataTransfer.files[0] ?? null);
      }}
    >
      <section aria-labelledby="titulo-home" className="animate-fade-up">
        <p className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground first-letter:uppercase">
          {today}
        </p>
        <h1
          id="titulo-home"
          className="mt-3 text-[2.6rem] leading-[1.02] tracking-[-0.02em] sm:text-6xl"
        >
          O que vamos <i className="grifo italic">estudar</i> hoje?
        </h1>

        <form
          onSubmit={handleGenerate}
          className={cn(
            "mt-8 rounded-lg transition-[outline-color] outline-2 outline-offset-8 outline-transparent",
            dragging && "outline-dashed outline-foreground/40",
          )}
        >
          <div className="flex items-center gap-3 border-b-[1.5px] border-foreground transition-[border-color,box-shadow] focus-within:border-ring focus-within:shadow-[0_1.5px_0_0_var(--color-ring)]">
            {attachedFile ? (
              <div className="flex h-14 min-w-0 flex-1 items-center gap-2.5">
                <FileText className="size-5 shrink-0" aria-hidden />
                <span className="truncate text-lg sm:text-xl">{attachedFile.file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tnum">
                  {attachedFile.kind.toUpperCase()} ·{" "}
                  {(attachedFile.file.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB
                </span>
                <button
                  type="button"
                  onClick={() => setAttachedFile(null)}
                  disabled={loading}
                  aria-label="Remover arquivo"
                  title="Remover arquivo"
                  className="ml-1 flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : (
              <>
                <label htmlFor="novo-topico" className="sr-only">
                  Tema de Fonoaudiologia
                </label>
                <input
                  id="novo-topico"
                  name="tema"
                  enterKeyHint="go"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Tema ou título da aula…"
                  autoComplete="off"
                  disabled={loading}
                  maxLength={120}
                  className="h-14 min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-[#77716a] disabled:opacity-60 sm:text-2xl"
                />
              </>
            )}
            <Button type="submit" className="h-11 shrink-0 rounded-md px-4" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              <span className="hidden sm:inline">{loading ? "Gerando…" : "Gerar material"}</span>
              <span className="sm:hidden">{loading ? "Gerando" : "Gerar"}</span>
              {!loading && <ArrowRight className="size-4" aria-hidden />}
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {!attachedFile && (
              <label
                className={cn(
                  "inline-flex h-9 cursor-pointer items-center gap-2 rounded-md font-medium text-foreground transition-colors hover:text-foreground/75",
                  "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
                  loading && "pointer-events-none opacity-60",
                )}
              >
                <Paperclip className="size-4" aria-hidden />
                Anexar PDF ou PPTX
                <input
                  type="file"
                  accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  className="sr-only"
                  disabled={loading}
                  onChange={(e) => {
                    handlePickFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            <span>
              {attachedFile
                ? "A IA identifica o tema sozinha ao ler o arquivo."
                : "ou arraste a aula para esta página · até 50 MB"}
            </span>
          </div>

          {attachedFile && (
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-foreground/85">
              <Checkbox
                checked={keepFile}
                onCheckedChange={(v) => setKeepFile(v === true)}
                disabled={loading}
                className="mt-0.5"
              />
              <span>
                Guardar o arquivo original
                {attachedFile.kind === "pptx" ? " (convertido em PDF)" : ""} para ver ao lado do
                resumo
              </span>
            </label>
          )}
          {attachedFile?.kind === "pptx" && keepFile && (
            <p className="mt-2 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
              Dica: se puder, exporte a aula como PDF no PowerPoint (Arquivo → Exportar → PDF) e
              envie o PDF. A prévia fica mais fiel e não precisa de conversão.
            </p>
          )}
          <p aria-live="polite" className={cn("text-sm text-muted-foreground", loading && "mt-3")}>
            {loading
              ? `${stage ?? "Gerando o material…"} Isso costuma levar de 20 a 90 segundos.`
              : ""}
          </p>
          {!loading && !attachedFile && (
            <p className="mt-3 flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
              <span className="mr-1">Sugestões:</span>
              {EXAMPLES.map((ex, i) => (
                <span key={ex} className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setTopic(ex);
                      document.getElementById("novo-topico")?.focus();
                    }}
                    className="inline-flex min-h-8 items-center rounded-sm text-foreground/85 underline decoration-border decoration-1 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
                  >
                    {ex}
                  </button>
                  {i < EXAMPLES.length - 1 && (
                    <span aria-hidden className="ml-1">
                      ·
                    </span>
                  )}
                </span>
              ))}
            </p>
          )}
        </form>
      </section>

      <dl className="mt-12 grid grid-cols-3 border-y border-border">
        {[
          { v: topics.data ? String(topics.data.length) : "—", l: "tópicos no caderno" },
          { v: totals ? `${fcPct}%` : "—", l: "dos flashcards revisados" },
          {
            v: totals ? String(totals.exams) : "—",
            l: totals?.exams === 1 ? "prova feita" : "provas feitas",
          },
        ].map((it, i) => (
          <div
            key={it.l}
            className={cn(
              "flex flex-col-reverse py-4",
              i > 0 && "border-l border-border pl-4 sm:pl-5",
            )}
          >
            <dt className="text-xs text-muted-foreground sm:text-sm">{it.l}</dt>
            <dd className="font-serif text-[2rem] leading-none tnum sm:text-[2.5rem]">{it.v}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="titulo-topicos" className="mt-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="titulo-topicos" className="text-[1.9rem] leading-none">
            Seus tópicos
          </h2>
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-0 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <label htmlFor="busca-topicos" className="sr-only">
              Buscar tópico
            </label>
            <input
              id="busca-topicos"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar no caderno…"
              className="h-10 w-full border-b border-border bg-transparent pl-6 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:shadow-[0_1px_0_0_var(--color-ring)]"
            />
          </div>
        </div>

        <div
          aria-hidden
          className="hidden border-b-[1.5px] border-foreground pb-2 text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_72px_84px_84px_128px_40px] md:gap-4"
        >
          <span>Tópico</span>
          <span>Criado</span>
          <span>Flashcards</span>
          <span>Questões</span>
          <span>Progresso</span>
          <span />
        </div>

        {topics.isLoading ? (
          <ul aria-label="Carregando tópicos" className="divide-y divide-border">
            {[64, 48, 72].map((w, i) => (
              <li key={i} className="py-5">
                <div className="h-5 rounded bg-black/[0.06]" style={{ width: `${w}%` }} />
              </li>
            ))}
          </ul>
        ) : !topics.data?.length ? (
          <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center">
            <p className="font-serif text-2xl">Seu caderno está em branco</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Digite um tema ou anexe uma aula acima para criar o primeiro tópico.
            </p>
          </div>
        ) : !filtered.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum tópico encontrado para “{search}”.
          </p>
        ) : (
          <ul className="divide-y divide-border border-b border-border">
            {filtered.map((t, i) => {
              const p = progress.data?.byTopic[t.id];
              const pct = progressPct(p);
              return (
                <li
                  key={t.id}
                  className="group relative animate-fade-up py-4 md:grid md:grid-cols-[minmax(0,1fr)_72px_84px_84px_128px_40px] md:items-center md:gap-4"
                  style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                >
                  <div className="min-w-0 pr-12 md:pr-0">
                    <Link
                      to="/topico/$id"
                      params={{ id: t.id }}
                      title={t.label}
                      className="line-clamp-2 rounded-sm font-serif text-[1.35rem] leading-[1.15] transition-colors after:absolute after:inset-0 after:content-[''] group-hover:text-foreground/75"
                    >
                      {t.label}
                    </Link>
                    <p className="mt-1.5 text-xs text-muted-foreground tnum md:hidden">
                      {shortDate(t.created_at)} · {p?.fcSeen ?? 0}/{p?.fcTotal ?? 0} flashcards ·{" "}
                      {p?.mcSeen ?? 0}/{p?.mcTotal ?? 0} questões · {pct}%
                    </p>
                  </div>
                  <span className="hidden text-sm text-muted-foreground tnum md:block">
                    {shortDate(t.created_at)}
                  </span>
                  <span className="hidden text-sm tnum md:block">
                    <span className="sr-only">Flashcards revisados: </span>
                    {p ? `${p.fcSeen}/${p.fcTotal}` : "—"}
                  </span>
                  <span className="hidden text-sm tnum md:block">
                    <span className="sr-only">Questões revisadas: </span>
                    {p ? `${p.mcSeen}/${p.mcTotal}` : "—"}
                  </span>
                  <span className="hidden items-center gap-2.5 md:flex">
                    <span aria-hidden className="relative h-[3px] w-16 rounded-full bg-border">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-foreground"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="text-sm tnum">
                      <span className="sr-only">Progresso: </span>
                      {pct}%
                    </span>
                  </span>
                  <div className="absolute right-0 top-3.5 z-10 md:static">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Mais opções de ${t.label}`}
                          className="flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <Ellipsis className="size-4" aria-hidden />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem asChild>
                          <Link to="/topico/$id" params={{ id: t.id }}>
                            Abrir
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setDeleteTarget({ id: t.id, title: t.label })}
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-4" aria-hidden /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{deleteTarget?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga o resumo, o esquema, os flashcards, as questões e os casos clínicos deste
              tópico. Não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteTopic}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}