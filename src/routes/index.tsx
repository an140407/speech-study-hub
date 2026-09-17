import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpen, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateMaterial } from "@/lib/study.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
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
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const generate = useServerFn(generateMaterial);

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

  async function handleGenerate(e?: React.FormEvent) {
    e?.preventDefault();
    const t = topic.trim();
    if (t.length < 3) { toast.error("Digite um tema com pelo menos 3 letras."); return; }
    setLoading(true);
    try {
      const res = await generate({ data: { topic: t } });
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
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Digite um tema de Fonoaudiologia"
            className="h-12 rounded-xl bg-card text-base shadow-soft"
            disabled={loading}
            maxLength={120}
          />
          <Button type="submit" size="lg" className="h-12 rounded-xl px-6 shadow-soft" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {loading ? "Gerando…" : "Gerar material de estudo"}
          </Button>
        </form>
        {loading && (
          <p className="mt-3 text-sm text-muted-foreground">Isso costuma levar de 20 a 60 segundos.</p>
        )}
        {!loading && (
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
        <div className="mb-4 flex items-center gap-2">
          <BookOpen className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold">Tópicos estudados</h2>
        </div>
        {topics.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="card-soft h-24 animate-pulse" />)}
          </div>
        ) : !topics.data?.length ? (
          <div className="card-soft p-8 text-center text-muted-foreground">
            Nenhum tópico ainda. Gere o seu primeiro material acima.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topics.data.map((t, i) => (
              <Link
                key={t.id}
                to="/topico/$id"
                params={{ id: t.id }}
                className="card-soft group animate-fade-up p-5 transition-all hover:-translate-y-0.5 hover:shadow-lift"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <h3 className="text-lg font-semibold leading-snug group-hover:text-primary">{t.title}</h3>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(t.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}