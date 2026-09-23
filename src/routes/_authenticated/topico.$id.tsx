import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { backfillSubtopics } from "@/lib/study-extra.functions";
import { ArrowLeft, Brain, FileText, HelpCircle, Layers, ListChecks, Stethoscope, Highlighter, EyeOff, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ClinicalCaseRow, FlashcardRow, McqRow, Mindmap } from "@/lib/study-types";
import { markdownToHtml } from "@/lib/markdown-to-html";
import { ResumoEditor } from "@/components/study/ResumoEditor";
import { HighlightableBlock, useHighlights } from "@/lib/highlight";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Flashcards } from "@/components/study/Flashcards";
import { McqPractice } from "@/components/study/McqPractice";
import { MindMap } from "@/components/study/MindMap";
import { ClinicalCase } from "@/components/study/ClinicalCase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/topico/$id")({
  head: () => ({
    meta: [
      { title: "Tópico de estudo — FonoLab" },
      { name: "description", content: "Resumo, mapa mental, flashcards, questões, caso clínico e revisão de um tema de Fonoaudiologia." },
      { property: "og:title", content: "Tópico de estudo — FonoLab" },
      { property: "og:description", content: "Material completo de estudo de Fonoaudiologia gerado por IA." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TopicPage,
});

async function loadTopic(id: string) {
  const [topic, materials, flashcards, mcq, cases] = await Promise.all([
    supabase.from("topics").select("id, title, created_at").eq("id", id).single(),
    supabase.from("materials").select("type, content").eq("topic_id", id),
    supabase.from("flashcards").select("id, topic_id, front, back, subtopic, seen_at").eq("topic_id", id).order("created_at").order("id"),
    supabase.from("mcq_questions").select("id, topic_id, question, options, correct_index, explanation, subtopic, ai_explanation, seen_at").eq("topic_id", id).order("created_at").order("id"),
    supabase.from("clinical_cases").select("id, topic_id, scenario, guiding_questions, case_explanation, created_at").eq("topic_id", id).order("created_at").order("id"),
  ]);
  if (topic.error) throw topic.error;
  const byType = Object.fromEntries((materials.data ?? []).map((m) => [m.type, m.content])) as Record<string, unknown>;
  const summaryContent = (byType["summary"] as { text?: string; html?: string } | undefined) ?? {};
  return {
    topic: topic.data,
    summaryText: summaryContent.text ?? "",
    summaryHtml: summaryContent.html ?? "",
    mindmap: (byType["mindmap"] as Mindmap | undefined) ?? null,
    cases: (cases.data ?? []) as unknown as ClinicalCaseRow[],
    review: (byType["review_questions"] as { items?: string[] } | undefined)?.items ?? [],
    flashcards: (flashcards.data ?? []) as unknown as FlashcardRow[],
    mcq: (mcq.data ?? []) as unknown as McqRow[],
  };
}

const TABS = [
  { v: "resumo", label: "Resumo", Icon: FileText },
  { v: "mapa", label: "Mapa Mental", Icon: Brain },
  { v: "flashcards", label: "Flashcards", Icon: Layers },
  { v: "questoes", label: "Questões", Icon: ListChecks },
  { v: "caso", label: "Caso Clínico", Icon: Stethoscope },
  { v: "revisao", label: "Revisão", Icon: HelpCircle },
];

function RevisaoTab({ topicId, review, maskMode }: { topicId: string; review: string[]; maskMode: boolean }) {
  const { rangesFor, onSelect, onRemove } = useHighlights(topicId, "revisao", undefined, maskMode);
  return (
    <ol className="space-y-3">
      {review.map((r, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{i + 1}</span>
          <HighlightableBlock as="p" className="pt-0.5 leading-relaxed" blockIndex={i} text={r} ranges={rangesFor(i)} onSelect={onSelect} onRemove={onRemove} />
        </li>
      ))}
    </ol>
  );
}

function EditableTitle({ id, title }: { id: string; title: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  async function save() {
    const v = value.trim();
    if (!v) { toast.error("O título não pode ficar vazio."); return; }
    if (v === title) { setEditing(false); return; }
    setSaving(true);
    const { error } = await supabase.from("topics").update({ title: v }).eq("id", id);
    setSaving(false);
    if (error) { toast.error("Falha ao renomear o tópico."); return; }
    toast.success("Tópico renomeado.");
    setEditing(false);
    queryClient.invalidateQueries({ queryKey: ["topic", id] });
    queryClient.invalidateQueries({ queryKey: ["topics"] });
  }

  if (editing) {
    return (
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-11 flex-1 text-lg font-semibold md:text-xl"
          maxLength={120}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") { setValue(title); setEditing(false); }
          }}
        />
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        <Button size="sm" variant="outline" onClick={() => { setValue(title); setEditing(false); }} disabled={saving}>
          Cancelar
        </Button>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className="group flex min-w-0 items-center gap-2 text-left">
      <h1 className="truncate text-3xl font-semibold leading-tight md:text-4xl">{title}</h1>
      <Pencil className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function TopicPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["topic", id], queryFn: () => loadTopic(id) });
  const [maskMode, setMaskMode] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  const backfill = useServerFn(backfillSubtopics);
  const backfilled = useRef(false);
  const summaryMigrated = useRef(false);

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

  async function deleteTopic() {
    setDeleting(true);
    const { error } = await supabase.from("topics").delete().eq("id", id);
    setDeleting(false);
    if (error) { toast.error("Falha ao excluir o tópico."); return; }
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
      .then((r) => { if (r.updated) queryClient.invalidateQueries({ queryKey: ["topic", id] }); })
      .catch(() => undefined);
  }, [q.data, backfill, id, queryClient]);


  if (q.isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 pt-8">
        <div className="h-10 w-2/3 animate-pulse rounded-lg bg-muted" />
        <div className="card-soft mt-6 h-96 animate-pulse" />
      </main>
    );
  }
  if (q.isError || !q.data) {
    return (
      <main className="mx-auto max-w-4xl px-4 pt-16 text-center">
        <p className="text-muted-foreground">Tópico não encontrado.</p>
        <Link to="/" className="mt-4 inline-block text-primary underline">Voltar</Link>
      </main>
    );
  }
  const d = q.data;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Tópicos
      </Link>
      <div className="mt-2 flex items-center justify-between gap-3">
        <EditableTitle id={id} title={d.topic.title} />
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setMaskMode((v) => !v)}
            title={maskMode ? "Esconder grifos (modo máscara)" : "Mostrar grifos"}
          >
            {maskMode ? <Highlighter className="size-4" /> : <EyeOff className="size-4" />}
            <span className="hidden sm:inline">{maskMode ? "Grifos visíveis" : "Grifos escondidos"}</span>
          </Button>
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)} title="Excluir tópico">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{d.topic.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga o resumo, mapa mental, flashcards, questões e casos clínicos desse tópico. Não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTopic} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tabs defaultValue="resumo" className="mt-6">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-card p-1 shadow-soft">
          {TABS.map(({ v, label, Icon }) => (
            <TabsTrigger key={v} value={v} className="flex-1 gap-1.5 rounded-lg py-2 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none">
              <Icon className="size-4" /> <span>{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumo" className="card-soft mt-4 animate-fade-up p-4 md:p-6">
          {d.summaryHtml ? (
            <ResumoEditor topicId={id} html={d.summaryHtml} maskMode={maskMode} />
          ) : (
            <p className="text-muted-foreground">Preparando o editor…</p>
          )}
        </TabsContent>
        <TabsContent value="mapa" className="mt-4 animate-fade-up">
          {d.mindmap ? <MindMap map={d.mindmap} /> : <p className="text-muted-foreground">Sem mapa mental.</p>}
        </TabsContent>
        <TabsContent value="flashcards" className="mt-4 animate-fade-up">
          <Flashcards cards={d.flashcards} topicId={id} />
        </TabsContent>
        <TabsContent value="questoes" className="mt-4 animate-fade-up">
          <McqPractice questions={d.mcq} topicId={id} />
        </TabsContent>
        <TabsContent value="caso" className="mt-4 animate-fade-up">
          <ClinicalCase cases={d.cases} topicId={id} maskMode={maskMode} />
        </TabsContent>
        <TabsContent value="revisao" className="card-soft mt-4 animate-fade-up p-6">
          <p className="mb-4 text-sm text-muted-foreground">Perguntas para reflexão — sem gabarito. Tente responder com suas palavras.</p>
          <RevisaoTab topicId={id} review={d.review} maskMode={maskMode} />
        </TabsContent>
      </Tabs>
    </main>
  );
}