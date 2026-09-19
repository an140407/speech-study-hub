import { useEffect, useRef, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { applyHighlights, clearHighlightMarks, getSelectionOffsets } from "@/lib/highlight";

type ContentType = "resumo" | "caso_clinico" | "revisao";

/** Envolve um bloco de texto renderizado: seleção de texto vira grifo amarelo permanente,
 *  salvo por tópico (e opcionalmente por caso clínico). O modo máscara só esconde/mostra
 *  visualmente, sem apagar nada do banco. */
export function Highlightable({
  topicId,
  contentType,
  caseId,
  maskMode,
  children,
}: {
  topicId: string;
  contentType: ContentType;
  caseId?: string | undefined;
  maskMode: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const queryKey = ["highlights", topicId, contentType, caseId ?? null];

  const highlights = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from("highlights")
        .select("id, start_offset, end_offset")
        .eq("topic_id", topicId)
        .eq("content_type", contentType);
      q = caseId ? q.eq("case_id", caseId) : q.is("case_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const addHighlight = useMutation({
    mutationFn: async (r: { start: number; end: number }) => {
      const { error } = await supabase.from("highlights").insert({
        topic_id: topicId,
        content_type: contentType,
        case_id: caseId ?? null,
        start_offset: r.start,
        end_offset: r.end,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  useEffect(() => {
    if (!ref.current) return;
    if (!maskMode || !highlights.data?.length) {
      clearHighlightMarks(ref.current);
      return;
    }
    applyHighlights(
      ref.current,
      highlights.data.map((h) => ({ id: h.id, start: h.start_offset, end: h.end_offset })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlights.data, maskMode]);

  function handleMouseUp() {
    if (!ref.current) return;
    const offsets = getSelectionOffsets(ref.current);
    if (!offsets) return;
    addHighlight.mutate(offsets);
    window.getSelection()?.removeAllRanges();
  }

  return (
    <div ref={ref} onMouseUp={handleMouseUp}>
      {children}
    </div>
  );
}