import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Brain, FileText, HelpCircle, Layers, ListChecks, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ClinicalCase as ClinicalCaseT, Flashcard, Mcq, Mindmap } from "@/lib/study-types";
import { SimpleMarkdown } from "@/lib/markdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Flashcards } from "@/components/study/Flashcards";
import { McqPractice } from "@/components/study/McqPractice";
import { MindMap } from "@/components/study/MindMap";
import { ClinicalCase } from "@/components/study/ClinicalCase";

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
    supabase.from("flashcards").select("front, back").eq("topic_id", id).order("created_at"),
    supabase.from("mcq_questions").select("question, options, correct_index, explanation").eq("topic_id", id).order("created_at"),
    supabase.from("clinical_cases").select("id, scenario, guiding_questions, case_explanation").eq("topic_id", id).order("created_at").limit(1),
  ]);
  if (topic.error) throw topic.error;
  const byType = Object.fromEntries((materials.data ?? []).map((m) => [m.type, m.content])) as Record<string, unknown>;
  return {
    topic: topic.data,
    summary: (byType["summary"] as { text?: string } | undefined)?.text ?? "",
    mindmap: (byType["mindmap"] as Mindmap | undefined) ?? null,
    clinicalCase: (cases.data?.[0] as ClinicalCaseT | undefined) ?? null,
    review: (byType["review_questions"] as { items?: string[] } | undefined)?.items ?? [],
    flashcards: (flashcards.data ?? []) as Flashcard[],
    mcq: (mcq.data ?? []) as unknown as Mcq[],
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

function TopicPage() {
  const { id } = Route.useParams();
  const q = useQuery({ queryKey: ["topic", id], queryFn: () => loadTopic(id) });

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
      <h1 className="mt-2 text-3xl font-semibold leading-tight md:text-4xl">{d.topic.title}</h1>

      <Tabs defaultValue="resumo" className="mt-6">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-card p-1 shadow-soft">
          {TABS.map(({ v, label, Icon }) => (
            <TabsTrigger key={v} value={v} className="flex-1 gap-1.5 rounded-lg py-2 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none">
              <Icon className="size-4" /> <span>{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumo" className="card-soft mt-4 animate-fade-up p-6 md:p-8">
          <SimpleMarkdown text={d.summary} />
        </TabsContent>
        <TabsContent value="mapa" className="mt-4 animate-fade-up">
          {d.mindmap ? <MindMap map={d.mindmap} /> : <p className="text-muted-foreground">Sem mapa mental.</p>}
        </TabsContent>
        <TabsContent value="flashcards" className="mt-4 animate-fade-up">
          <Flashcards cards={d.flashcards} />
        </TabsContent>
        <TabsContent value="questoes" className="mt-4 animate-fade-up">
          <McqPractice questions={d.mcq} />
        </TabsContent>
        <TabsContent value="caso" className="mt-4 animate-fade-up">
          {d.clinicalCase ? <ClinicalCase data={d.clinicalCase} /> : <p className="text-muted-foreground">Sem caso clínico.</p>}
        </TabsContent>
        <TabsContent value="revisao" className="card-soft mt-4 animate-fade-up p-6">
          <p className="mb-4 text-sm text-muted-foreground">Perguntas para reflexão — sem gabarito. Tente responder com suas palavras.</p>
          <ol className="space-y-3">
            {d.review.map((r, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{i + 1}</span>
                <p className="pt-0.5 leading-relaxed">{r}</p>
              </li>
            ))}
          </ol>
        </TabsContent>
      </Tabs>
    </main>
  );
}