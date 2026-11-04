import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { delatex } from "./delatex";
import { buildGlossary } from "./glossary";

/**
 * Monta o glossário no servidor: lê os resumos de todos os tópicos da pessoa e devolve
 * só os termos (o navegador não precisa baixar os resumos inteiros).
 */
export const getGlossary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const [{ data: topics, error: topicsError }, { data: summaries, error: summariesError }] =
      await Promise.all([
        supabase.from("topics").select("id, title, folder_id"),
        supabase.from("materials").select("topic_id, content").eq("type", "summary"),
      ]);
    if (topicsError || summariesError) throw new Error("Não deu para carregar o glossário.");

    const htmlByTopic = new Map(
      (summaries ?? []).map((m) => [
        m.topic_id as string,
        String((m.content as { html?: string } | null)?.html ?? ""),
      ]),
    );
    const entries = buildGlossary(
      (topics ?? [])
        .map((t) => ({
          id: t.id as string,
          title: String(t.title ?? "")
            .replace(/\s+/g, " ")
            .trim(),
          folderId: (t.folder_id as string | null) ?? null,
          html: htmlByTopic.get(t.id as string) ?? "",
        }))
        .filter((t) => t.html),
      (text) => delatex(text),
    );
    return { entries, topics: htmlByTopic.size };
  });
