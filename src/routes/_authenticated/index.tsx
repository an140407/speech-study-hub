import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpen, FileText, Loader2, Paperclip, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateMaterial, generateMaterialFromPdf } from "@/lib/study.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "FonoLab — Material de estudo de Fonoaudiologia com IA" },
      { name: "description", content: "Digite um tema de Fonoaudiologia e receba resumo, mapa mental, flashcards, questões e caso clínico." },
      { property: "og:title", content: "FonoLab — Estude Fonoaudiologia com IA" },
      { property: "og:description", content: "Resumos, flashcards, questões e casos clínicos gerados por IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const EXAMPLES = ["Paralisia facial periférica", "Disfagia orofaríngea", "Gagueira do desenvolvimento", "Presbiacusia"];

function Index() {
  const [topic, setTopic] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const generate = useServerFn(generateMaterial);
  const generateFromPdf = useServerFn(generateMaterialFromPdf);

  const [search, setSearch] = useState("");

  const topics = useQuery({
    queryKey: ["topics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("id, title, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const progress = useQuery({
    queryKey: ["topics-progress"],
    queryFn: async () => {
      const [fc, mc, exams] = await Promise.all([
        supabase.from("flashcards").select("topic_id, seen_at"),
        supabase.from("mcq_questions").select("id, topic_id, seen_at"),
        supabase.from("exam_attempts").select("question_ids"),
      ]);
      const map: Record<string, { fcTotal: number; fcSeen: number; mcTotal: number; mcSeen: number; exams: number }> = {};
      const get = (t: string) => (map[t] ??= { fcTotal: 0, fcSeen: 0, mcTotal: 0, mcSeen: 0, exams: 0 });
      for (const f of fc.data ?? []) { const e = get(f.topic_id); e.fcTotal++; if (f.seen_at) e.fcSeen++; }
      const topicOfQuestion: Record<string, string> = {};
      for (const m of mc.data ?? []) {
        topicOfQuestion[m.id] = m.topic_id;
        const e = get(m.topic_id); e.mcTotal++; if (m.seen_at) e.mcSeen++;
      }
      for (const a of exams.data ?? []) {
        const ids = (a.question_ids as unknown as string[]) ?? [];
        const topicsOf = new Set(ids.map((qid) => topicOfQuestion[qid]));
        if (ids.length > 0 && topicsOf.size === 1) {
          const only = [...topicsOf][0];
          if (only) get(only).exams++;
        }
      }
      return map;
    },
  });

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDeleteTopic() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("topics").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) { toast.error("Falha ao excluir o tópico."); return; }
    toast.success("Tópico excluído.");
    setDeleteTarget(null);
    queryClient.invalidateQueries({ queryKey: ["topics"] });
    queryClient.invalidateQueries({ queryKey: ["topics-progress"] });
  }

  const filtered = (topics.data ?? []).filter((t) =>
    t.title.toLowerCase().includes(search.trim().toLowerCase()),
  );


  function handlePickPdf(file: File | null) {
    if (!file) return;
    if (file.type !== "application/pdf") { toast.error("Envie um arquivo PDF."); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error("PDF muito grande — o limite é 15MB."); return; }
    setTopic("");
    setPdfFile(file);
  }

  function readAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
      reader.readAsDataURL(file);
    });
  }

  async function handleGenerate(e?: React.FormEvent) {
    e?.preventDefault();
    if (!pdfFile) {
      const t = topic.trim();
      if (t.length < 3) { toast.error("Digite um tema com pelo menos 3 letras, ou anexe um PDF."); return; }
    }
    setLoading(true);
    try {
      const res = pdfFile
        ? await generateFromPdf({ data: { pdf_base64: await readAsBase64(pdfFile) } })
        : await generate({ data: { topic: topic.trim() } });
      await queryClient.invalidateQueries({ queryKey: ["topics"] });
      toast.success("Material gerado!");
      navigate({ to: "/topico/$id", params: { id: res.topic_id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar o material.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-10 md:pt-16">
      <section className="animate-fade-up text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          <Sparkles className="size-3.5" /> Gerado por IA
        </span>
        <h1 className="mt-4 text-4xl font-semibold leading-tight md:text-5xl">
          Estude Fonoaudiologia <span className="text-primary">com método</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Digite um tema e receba resumo, mapa mental, flashcards, questões comentadas e um caso clínico.
        </p>

        <form onSubmit={handleGenerate} className="mx-auto mt-8 flex max-w-xl flex-col gap-2 sm:flex-row">
          {pdfFile ? (
            <div className="flex h-12 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 shadow-soft">
              <FileText className="size-4 shrink-0 text-primary" />
              <span className="truncate text-sm">{pdfFile.name}</span>
              <button
                type="button"
                onClick={() => setPdfFile(null)}
                className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Remover PDF"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="relative flex-1">
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Digite um tema de Fonoaudiologia"
                className="h-12 rounded-xl bg-card pr-10 text-base shadow-soft"
                disabled={loading}
                maxLength={120}
              />
              <label
                title="Ou envie um PDF de aula"
                className="absolute right-1 top-1 flex size-10 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Paperclip className="size-4" />
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={loading}
                  onChange={(e) => handlePickPdf(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          )}
          <Button type="submit" size="lg" className="h-12 rounded-xl px-6 shadow-soft" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {loading ? "Gerando…" : pdfFile ? "Gerar a partir do PDF" : "Gerar material de estudo"}
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          {pdfFile ? "A IA identifica o tema sozinha ao ler o PDF." : "Ou anexe um PDF de aula pelo clipe — a IA descobre o tema sozinha."}
        </p>
        {loading && (
          <p className="mt-3 text-sm text-muted-foreground">Isso costuma levar de 20 a 60 segundos.</p>
        )}
        {!loading && !pdfFile && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setTopic(ex)}
                className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mt-16">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold">Tópicos estudados</h2>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tópico…"
            className="h-10 w-full rounded-xl bg-card shadow-soft sm:w-64"
          />
        </div>
        {topics.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="card-soft h-24 animate-pulse" />)}
          </div>
        ) : !topics.data?.length ? (
          <div className="card-soft p-8 text-center text-muted-foreground">
            Nenhum tópico ainda. Gere o seu primeiro material acima.
          </div>
        ) : !filtered.length ? (
          <div className="card-soft p-8 text-center text-muted-foreground">
            Nenhum tópico encontrado para “{search}”.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t, i) => {
              const p = progress.data?.[t.id];
              return (
                <Link
                  key={t.id}
                  to="/topico/$id"
                  params={{ id: t.id }}
                  className="card-soft group relative animate-fade-up p-5 transition-all hover:-translate-y-0.5 hover:shadow-lift"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <button
                    type="button"
                    title="Excluir tópico"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget({ id: t.id, title: t.title }); }}
                    className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                  <h3 className="pr-6 text-lg font-semibold leading-snug group-hover:text-primary">{t.title}</h3>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                  {p && (
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <p>{p.fcSeen} de {p.fcTotal} flashcards revisados</p>
                      <p>{p.mcSeen} de {p.mcTotal} questões revisadas</p>
                      <p>{p.exams} {p.exams === 1 ? "prova feita" : "provas feitas"}</p>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{deleteTarget?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga o resumo, mapa mental, flashcards, questões e casos clínicos desse tópico. Não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteTopic} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}