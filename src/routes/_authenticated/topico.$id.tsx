import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { backfillSubtopics } from "@/lib/study-extra.functions";
import { ArrowLeft, Ellipsis, FileText, Loader2, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ClinicalCaseRow, FlashcardRow, McqRow, Mindmap } from "@/lib/study-types";
import { markdownToHtml } from "@/lib/markdown-to-html";
import { ResumoEditor } from "@/components/study/ResumoEditor";
import { ResumoEmptyState } from "@/components/study/ResumoEmptyState";
import { RegenerateSummaryButton } from "@/components/study/RegenerateSummaryButton";
import { ResumoSplitLayout } from "@/components/study/ResumoSplitLayout";
import { SourcePdfViewer } from "@/components/study/SourcePdfViewer";
import {
  deleteTopic as deleteTopicFn,
  generateSummary,
  getSourceFileUrl,
} from "@/lib/source.functions";
import { aiErrorMessage, withAiRetry } from "@/lib/ai-busy";
import { HighlightableBlock, useHighlights } from "@/lib/highlight";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Flashcards } from "@/components/study/Flashcards";
import { McqPractice } from "@/components/study/McqPractice";
import { Esquema, type PracticeTarget } from "@/components/study/Esquema";
import { ClinicalCase } from "@/components/study/ClinicalCase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResumoToc } from "@/components/study/ResumoToc";
import { delatex } from "@/lib/delatex";
import { cleanTitle } from "@/lib/topics-index";
import { cn } from "@/lib/utils";
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

export const Route = createFileRoute("/_authenticated/topico/$id")({
  // A aba aberta fica na URL (?aba=questoes): recarregar ou compartilhar volta para ela
  validateSearch: (s: Record<string, unknown>): { aba?: TabId } =>
    TABS.some((t) => t.v === s["aba"]) ? { aba: s["aba"] as TabId } : {},
  head: () => ({
    meta: [
      { title: "Tópico de estudo — FonoLab" },
      {
        name: "description",
        content:
          "Resumo, esquema, flashcards, questões, caso clínico e revisão de um tema de Fonoaudiologia.",
      },
      { property: "og:title", content: "Tópico de estudo — FonoLab" },
      {
        property: "og:description",
        content: "Material completo de estudo de Fonoaudiologia gerado por IA.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TopicPage,
});

/** Resumo sem texto (ex.: "<p></p>" de quem abriu o editor e não escreveu) conta como vazio. */
function isEmptyHtml(html: string) {
  if (!html) return true;
  if (/<(table|img)\b/i.test(html)) return false;
  return !html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

async function loadTopic(id: string) {
  const [topic, materials, flashcards, mcq, cases] = await Promise.all([
    supabase
      .from("topics")
      .select("id, title, created_at, source_hash, source_kind, source_name")
      .eq("id", id)
      .single(),
    supabase.from("materials").select("type, content").eq("topic_id", id),
    supabase
      .from("flashcards")
      .select("id, topic_id, front, back, subtopic, seen_at")
      .eq("topic_id", id)
      .order("created_at")
      .order("id"),
    supabase
      .from("mcq_questions")
      .select(
        "id, topic_id, question, options, correct_index, explanation, subtopic, ai_explanation, seen_at",
      )
      .eq("topic_id", id)
      .order("created_at")
      .order("id"),
    supabase
      .from("clinical_cases")
      .select("id, topic_id, scenario, guiding_questions, case_explanation, created_at")
      .eq("topic_id", id)
      .order("created_at")
      .order("id"),
  ]);
  if (topic.error) throw topic.error;
  const byType = Object.fromEntries(
    (materials.data ?? []).map((m) => [m.type, m.content]),
  ) as Record<string, unknown>;
  const summaryContent = (byType["summary"] as { text?: string; html?: string } | undefined) ?? {};
  // Fórmulas que a IA escreveu em LaTeX ("$SpO_2$") viram texto comum ("SpO₂")
  const tx = (v: string | null | undefined) => (v ? delatex(v) : (v ?? ""));
  const cs = ((cases.data ?? []) as unknown as ClinicalCaseRow[]).map((c) => ({
    ...c,
    scenario: tx(c.scenario),
    case_explanation: c.case_explanation ? delatex(c.case_explanation) : c.case_explanation,
    guiding_questions: (c.guiding_questions ?? []).map((g) => ({
      ...g,
      question: tx(g.question),
      answer: tx(g.answer),
    })),
  }));
  return {
    topic: topic.data,
    summaryText: summaryContent.text ?? "",
    summaryHtml: delatex(summaryContent.html ?? "", "html"),
    mindmap: (byType["mindmap"] as Mindmap | undefined) ?? null,
    cases: cs,
    review: ((byType["review_questions"] as { items?: string[] } | undefined)?.items ?? []).map(
      (r) => tx(r),
    ),
    flashcards: ((flashcards.data ?? []) as unknown as FlashcardRow[]).map((f) => ({
      ...f,
      front: tx(f.front),
      back: tx(f.back),
    })),
    mcq: ((mcq.data ?? []) as unknown as McqRow[]).map((q) => ({
      ...q,
      question: tx(q.question),
      options: (q.options ?? []).map((o) => tx(o)),
      explanation: tx(q.explanation),
    })),
  };
}

const TABS = [
  { v: "resumo", label: "Resumo" },
  { v: "esquema", label: "Esquema" },
  { v: "flashcards", label: "Flashcards" },
  { v: "questoes", label: "Questões" },
  { v: "caso", label: "Caso clínico" },
  { v: "revisao", label: "Revisão" },
] as const;
type TabId = (typeof TABS)[number]["v"];

function RevisaoTab({
  topicId,
  review,
  maskMode,
}: {
  topicId: string;
  review: string[];
  maskMode: boolean;
}) {
  const { rangesFor, onSelect, onRemove } = useHighlights(topicId, "revisao", undefined, maskMode);
  return (
    <ol className="max-w-[68ch] divide-y divide-border border-y border-border">
      {review.map((r, i) => (
        <li key={i} className="flex gap-4 py-4">
          <span className="w-6 shrink-0 pt-0.5 font-mono text-sm text-muted-foreground tnum">
            {String(i + 1).padStart(2, "0")}
          </span>
          <HighlightableBlock
            as="p"
            className="text-[1.0625rem] leading-relaxed"
            blockIndex={i}
            text={r}
            ranges={rangesFor(i)}
            onSelect={onSelect}
            onRemove={onRemove}
          />
        </li>
      ))}
    </ol>
  );
}

function TitleEditor({ id, title, onDone }: { id: string; title: string; onDone: () => void }) {
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  async function save() {
    const v = value.trim();
    if (!v) {
      toast.error("O título não pode ficar vazio.");
      return;
    }
    if (v === title) {
      onDone();
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("topics").update({ title: v }).eq("id", id);
    setSaving(false);
    if (error) {
      toast.error("Falha ao renomear o tópico.");
      return;
    }
    toast.success("Tópico renomeado.");
    onDone();
    queryClient.invalidateQueries({ queryKey: ["topic", id] });
    queryClient.invalidateQueries({ queryKey: ["topics"] });
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <label htmlFor="titulo-topico" className="sr-only">
        Título do tópico
      </label>
      <Input
        id="titulo-topico"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-12 min-w-0 flex-1 bg-card font-serif text-2xl md:text-3xl"
        maxLength={120}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onDone();
        }}
      />
      <Button onClick={save} disabled={saving} className="h-10">
        {saving ? "Salvando…" : "Salvar"}
      </Button>
      <Button variant="ghost" onClick={onDone} disabled={saving} className="h-10">
        Cancelar
      </Button>
    </div>
  );
}

function TopicPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["topic", id], queryFn: () => loadTopic(id) });
  const [maskMode, setMaskMode] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  // "Renomear" no menu: ao fechar, o foco vai para o campo do título (e não volta ao botão ⋯)
  const focusTitleAfterMenu = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  const backfill = useServerFn(backfillSubtopics);
  const backfilled = useRef(false);
  const summaryMigrated = useRef(false);
  const [writingOwn, setWritingOwn] = useState(false);
  const [summaryVersion, setSummaryVersion] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const { aba } = Route.useSearch();
  const tab: TabId = aba && TABS.some((t) => t.v === aba) ? aba : "resumo";
  const setTab = (v: string) =>
    void navigate({
      to: "/topico/$id",
      params: { id },
      search: v === "resumo" ? {} : { aba: v as TabId },
      replace: true,
      resetScroll: false,
    });
  // "Praticar este ramo" no Esquema: abre os flashcards já filtrados pelo ramo
  const [practiceFocus, setPracticeFocus] = useState<{ subtopic: string; key: number } | null>(
    null,
  );
  const genSummary = useServerFn(generateSummary);
  const sourceUrlFn = useServerFn(getSourceFileUrl);
  const removeTopic = useServerFn(deleteTopicFn);
  const hasSource = !!q.data?.topic.source_hash;
  // Conversão de PPTX rodando em segundo plano (marcada pela Home ao criar o tópico).
  const sourcePending = useQuery({
    queryKey: ["source-pending", id],
    queryFn: () => false,
    enabled: false,
  });

  const summaryGen = useMutation({
    mutationFn: () =>
      withAiRetry(
        () => genSummary({ data: { topic_id: id } }),
        (wait) =>
          toast.info(
            `O servidor da IA está congestionado — tentando de novo em ${wait}s. Pode demorar alguns segundos a mais.`,
          ),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["topic", id] });
      setWritingOwn(false);
      setSummaryVersion((v) => v + 1);
      toast.success("Resumo gerado!");
    },
    onError: (e) => toast.error(aiErrorMessage(e, "Falha ao gerar o resumo.")),
  });

  // Link temporário (10 min) do material original, pedido só quando a prévia é aberta.
  const sourceUrl = useQuery({
    queryKey: ["source-url", id],
    enabled: viewerOpen && hasSource,
    staleTime: 8 * 60 * 1000,
    queryFn: async () => (await sourceUrlFn({ data: { topic_id: id } })).url,
  });

  // Converte o resumo de markdown pra HTML uma única vez (pra ficar editável no TipTap).
  useEffect(() => {
    const d = q.data;
    if (!d || summaryMigrated.current || d.summaryHtml) return;
    if (!d.summaryText.trim()) return;
    summaryMigrated.current = true;
    const html = markdownToHtml(d.summaryText);
    supabase
      .from("materials")
      .update({ content: { html, text: d.summaryText } })
      .eq("topic_id", id)
      .eq("type", "summary")
      .then(() => queryClient.invalidateQueries({ queryKey: ["topic", id] }));
  }, [q.data, id, queryClient]);

  function practiceBranch(target: PracticeTarget, subtopic: string | null) {
    if (subtopic) setPracticeFocus({ subtopic, key: Date.now() });
    setTab(target);
    requestAnimationFrame(() =>
      document
        .getElementById("topico-abas")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  async function deleteTopic() {
    setDeleting(true);
    try {
      await removeTopic({ data: { topic_id: id } });
    } catch {
      setDeleting(false);
      toast.error("Falha ao excluir o tópico.");
      return;
    }
    setDeleting(false);
    queryClient.invalidateQueries({ queryKey: ["topics"] });
    navigate({ to: "/" });
  }

  // Classifica em segundo plano flashcards/questões antigos sem sub-tópico.
  useEffect(() => {
    const d = q.data;
    if (!d || backfilled.current) return;
    const missing = d.flashcards.some((f) => !f.subtopic) || d.mcq.some((m) => !m.subtopic);
    if (!missing) return;
    backfilled.current = true;
    backfill({ data: { topic_id: id } })
      .then((r) => {
        if (r.updated) queryClient.invalidateQueries({ queryKey: ["topic", id] });
      })
      .catch(() => undefined);
  }, [q.data, backfill, id, queryClient]);

  if (q.isLoading) {
    return (
      <main className="mx-auto w-full max-w-[960px] px-5 pt-8 sm:px-8 lg:pt-12" aria-busy="true">
        <div className="h-4 w-40 animate-pulse rounded bg-black/[0.06]" />
        <div className="mt-8 h-12 w-3/4 animate-pulse rounded bg-black/[0.06]" />
        <div className="mt-10 h-px bg-border" />
        <div className="mt-8 space-y-3">
          {[92, 85, 96, 70].map((w, i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded bg-black/[0.05]"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      </main>
    );
  }
  if (q.isError || !q.data) {
    return (
      <main className="mx-auto w-full max-w-[960px] px-5 pt-20 text-center sm:px-8">
        <h1 className="text-4xl">Tópico não encontrado</h1>
        <p className="mt-3 text-muted-foreground">Ele pode ter sido excluído.</p>
        <Link
          to="/"
          className="mt-6 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Voltar aos tópicos
        </Link>
      </main>
    );
  }
  const d = q.data;
  const displayTitle = cleanTitle(d.topic.title) || d.topic.title;
  const wide = viewerOpen && hasSource;
  const created = new Date(d.topic.created_at).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const fcSeen = d.flashcards.filter((f) => f.seen_at).length;
  const mcSeen = d.mcq.filter((m) => m.seen_at).length;
  const counts: Record<string, string | null> = {
    flashcards: d.flashcards.length ? `${fcSeen}/${d.flashcards.length}` : null,
    questoes: d.mcq.length ? `${mcSeen}/${d.mcq.length}` : null,
  };

  const mcqCounts = d.mcq.reduce<Record<string, number>>((acc, m) => {
    if (m.subtopic) acc[m.subtopic] = (acc[m.subtopic] ?? 0) + 1;
    return acc;
  }, {});

  function openOriginal() {
    setTab("resumo");
    setViewerOpen(true);
  }

  return (
    <main
      className={cn(
        "mx-auto w-full px-5 pb-24 pt-5 sm:px-8 lg:pt-10",
        wide ? "max-w-[1400px]" : "max-w-[960px]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <nav
          aria-label="Você está em"
          className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Link
            to="/"
            className="-my-2 inline-flex min-h-10 shrink-0 items-center gap-1 rounded-sm transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> Tópicos
          </Link>
          <span aria-hidden>/</span>
          <span className="truncate text-foreground/80" aria-current="page">
            {displayTitle}
          </span>
        </nav>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-pressed={maskMode}
            onClick={() => setMaskMode((v) => !v)}
            title={maskMode ? "Esconder os grifos" : "Mostrar os grifos"}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            <span
              aria-hidden
              className={cn(
                "relative inline-block h-[18px] w-8 shrink-0 rounded-full transition-colors",
                maskMode ? "bg-foreground" : "bg-border",
              )}
            >
              <span
                className={cn(
                  "absolute left-0 top-[2px] size-3.5 rounded-full transition-transform",
                  maskMode ? "translate-x-[16px] bg-hl" : "translate-x-[2px] bg-card",
                )}
              />
            </span>
            Grifos
          </button>
          {sourcePending.data ? (
            <Button size="sm" variant="outline" disabled className="hidden h-9 text-sm sm:inline-flex">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Convertendo…
            </Button>
          ) : (
            hasSource && (
              <Button
                size="sm"
                variant="outline"
                className="hidden h-9 text-sm sm:inline-flex"
                onClick={openOriginal}
                disabled={wide && tab === "resumo"}
              >
                <FileText className="size-4" aria-hidden /> Material original
              </Button>
            )
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Mais opções do tópico"
                className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-accent"
              >
                <Ellipsis className="size-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-52"
              onCloseAutoFocus={(e) => {
                if (!focusTitleAfterMenu.current) return;
                e.preventDefault();
                focusTitleAfterMenu.current = false;
                window.requestAnimationFrame(() => {
                  const el = document.getElementById("titulo-topico") as HTMLInputElement | null;
                  el?.focus();
                  el?.select();
                });
              }}
            >
              <DropdownMenuItem
                onSelect={() => {
                  focusTitleAfterMenu.current = true;
                  setRenaming(true);
                }}
                className="gap-2"
              >
                <Pencil className="size-4" aria-hidden /> Renomear
              </DropdownMenuItem>
              {hasSource && !sourcePending.data && (
                <DropdownMenuItem onSelect={openOriginal} className="gap-2 sm:hidden">
                  <FileText className="size-4" aria-hidden /> Material original
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setConfirmDelete(true)}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden /> Excluir tópico
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {renaming ? (
        <>
          <h1 className="sr-only">{displayTitle}</h1>
          <TitleEditor id={id} title={d.topic.title} onDone={() => setRenaming(false)} />
        </>
      ) : (
        <h1 className="mt-6 text-[2.35rem] leading-[1.04] tracking-[-0.02em] sm:text-5xl">
          {displayTitle}
        </h1>
      )}
      <p className="mt-3 text-sm text-muted-foreground">
        {d.topic.source_name ? (
          <>
            Gerado de <span className="text-foreground/80">{d.topic.source_name}</span> · {created}
          </>
        ) : (
          <>Criado em {created}</>
        )}
      </p>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{d.topic.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga o resumo, o esquema, os flashcards, as questões e os casos clínicos deste
              tópico. Não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteTopic}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <TabsList
          id="topico-abas"
          className="h-auto w-full scroll-mt-20 justify-start gap-6 overflow-x-auto rounded-none border-b border-border bg-transparent p-0 text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map(({ v, label }) => (
            <TabsTrigger
              key={v}
              value={v}
              className="-mb-px h-11 shrink-0 rounded-none border-b-2 border-transparent bg-transparent px-0 text-[0.9375rem] font-normal shadow-none transition-colors hover:text-foreground focus-visible:ring-offset-0 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              {label}
              {counts[v] && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground tnum">
                  {counts[v]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumo" className="mt-6 animate-fade-up">
          <ResumoSplitLayout
            viewerOpen={viewerOpen}
            onOpenViewer={() => setViewerOpen(true)}
            viewer={
              hasSource && viewerOpen ? (
                <SourcePdfViewer
                  url={sourceUrl.data ?? null}
                  loading={sourceUrl.isLoading}
                  onClose={() => setViewerOpen(false)}
                />
              ) : null
            }
            summary={(() => {
              const hasContent = !isEmptyHtml(d.summaryHtml);

              if (!d.summaryHtml && d.summaryText.trim()) {
                return <p className="py-8 text-muted-foreground">Preparando o editor…</p>;
              }
              if (hasContent || writingOwn) {
                return (
                  <div
                    className={cn(!wide && "xl:grid xl:grid-cols-[minmax(0,1fr)_13rem] xl:gap-12")}
                  >
                    <div className="min-w-0">
                      <ResumoEditor
                        key={`resumo-${summaryVersion}`}
                        topicId={id}
                        html={d.summaryHtml || "<p></p>"}
                        maskMode={maskMode}
                        startEditing={writingOwn && !hasContent}
                        onEditingDone={(html) => {
                          if (isEmptyHtml(html)) setWritingOwn(false);
                          queryClient.invalidateQueries({ queryKey: ["topic", id] });
                        }}
                        readActions={
                          hasContent ? (
                            <RegenerateSummaryButton
                              onConfirm={() => summaryGen.mutate()}
                              generating={summaryGen.isPending}
                            />
                          ) : null
                        }
                      />
                    </div>
                    {!wide && hasContent && (
                      <aside aria-label="Neste resumo" className="hidden xl:block">
                        <ResumoToc html={d.summaryHtml} />
                      </aside>
                    )}
                  </div>
                );
              }
              return (
                <div className="space-y-3">
                  <ResumoEmptyState
                    onWriteOwn={() => setWritingOwn(true)}
                    onGenerate={() => summaryGen.mutate()}
                    generating={summaryGen.isPending}
                  />
                </div>
              );
            })()}
          />
        </TabsContent>
        <TabsContent value="esquema" className="mt-6 animate-fade-up">
          {d.mindmap ? (
            <Esquema
              map={d.mindmap}
              topicId={id}
              flashcards={d.flashcards}
              mcq={d.mcq}
              onPractice={practiceBranch}
            />
          ) : (
            <p className="text-muted-foreground">Este tópico não tem esquema.</p>
          )}
        </TabsContent>
        <TabsContent value="flashcards" className="mt-6 animate-fade-up">
          <Flashcards
            cards={d.flashcards}
            topicId={id}
            focus={practiceFocus}
            mcqCounts={mcqCounts}
            onGoQuestions={(sub) => practiceBranch("questoes", sub)}
          />
        </TabsContent>
        <TabsContent value="questoes" className="mt-6 animate-fade-up">
          <McqPractice questions={d.mcq} topicId={id} focus={practiceFocus} />
        </TabsContent>
        <TabsContent value="caso" className="mt-6 animate-fade-up">
          <ClinicalCase cases={d.cases} topicId={id} maskMode={maskMode} />
        </TabsContent>
        <TabsContent value="revisao" className="mt-6 animate-fade-up">
          <p className="mb-5 text-sm text-muted-foreground">
            Perguntas para refletir, sem gabarito. Tente responder com suas palavras, em voz alta ou
            no papel.
          </p>
          <RevisaoTab topicId={id} review={d.review} maskMode={maskMode} />
        </TabsContent>
      </Tabs>
    </main>
  );
}