import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Fontes extras do tópico (a fonte original continua nos campos do próprio tópico). */
export type TopicSourceRow = {
  id: string;
  kind: "pdf" | "pptx" | "texto";
  name: string | null;
  position: number;
  merged_at: string | null;
  created_at: string;
  chars: number;
};

export function useTopicSources(topicId: string) {
  return useQuery({
    queryKey: ["topic-sources", topicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topic_sources")
        .select("id, kind, name, position, merged_at, created_at, text")
        .eq("topic_id", topicId)
        .gt("position", 0)
        .order("position");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        kind: r.kind as TopicSourceRow["kind"],
        name: r.name,
        position: r.position,
        merged_at: r.merged_at,
        created_at: r.created_at,
        chars: (r.text ?? "").length,
      })) as TopicSourceRow[];
    },
  });
}

export async function removeTopicSource(id: string) {
  const { error } = await supabase.from("topic_sources").delete().eq("id", id);
  if (error) throw new Error(`Não deu para remover a fonte (${error.message}).`);
}

/** Nome da fonte sem a extensão do arquivo. */
export const sourceLabel = (name: string | null) =>
  (name ?? "Fonte sem nome").replace(/\.(pdf|pptx)$/i, "").trim() || "Fonte sem nome";

export async function fileSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function fileKind(file: File): "pdf" | "pptx" | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    name.endsWith(".pptx")
  )
    return "pptx";
  return null;
}
