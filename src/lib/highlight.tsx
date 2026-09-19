import { useRef, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type HighlightRange = { id: string; start: number; end: number };

/** true se [start,end) sobrepõe algum intervalo já existente. */
export function overlapsExisting(start: number, end: number, existing: { start: number; end: number }[]): boolean {
  return existing.some((r) => start < r.end && end > r.start);
}

/**
 * Renderiza um texto (com **negrito** opcional) já com os grifos aplicados por cima —
 * tudo calculado como dado puro e devolvido como React nodes. Nenhuma manipulação de DOM.
 */
export function renderHighlighted(
  text: string,
  ranges: HighlightRange[],
  keyPrefix: string,
  onRemove?: (id: string) => void,
): ReactNode {
  type Seg = { text: string; bold: boolean; offset: number };
  const segs: Seg[] = [];
  let offset = 0;
  for (const part of text.split(/(\*\*[^*]+\*\*)/g)) {
    if (!part) continue;
    const bold = part.startsWith("**") && part.endsWith("**");
    const content = bold ? part.slice(2, -2) : part;
    if (!content) continue;
    segs.push({ text: content, bold, offset });
    offset += content.length;
  }
  const totalLen = offset;
  if (segs.length === 0) return null;

  const cuts = new Set<number>([0, totalLen]);
  for (const s of segs) {
    cuts.add(s.offset);
    cuts.add(s.offset + s.text.length);
  }
  for (const r of ranges) {
    cuts.add(Math.max(0, Math.min(r.start, totalLen)));
    cuts.add(Math.max(0, Math.min(r.end, totalLen)));
  }
  const points = Array.from(cuts).sort((a, b) => a - b);

  const nodes: ReactNode[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]!;
    const end = points[i + 1]!;
    if (start >= end) continue;
    const seg = segs.find((s) => start >= s.offset && end <= s.offset + s.text.length);
    if (!seg) continue;
    const chunk = seg.text.slice(start - seg.offset, end - seg.offset);
    const match = ranges.find((r) => start < r.end && end > r.start);
    let node: ReactNode = chunk;
    if (seg.bold) node = <strong key={`${keyPrefix}-b-${i}`}>{node}</strong>;
    if (match) {
      const id = match.id;
      node = (
        <mark
          key={`${keyPrefix}-m-${i}`}
          className="fono-highlight cursor-pointer"
          title="Clique para remover o grifo"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.(id);
          }}
        >
          {node}
        </mark>
      );
    }
    nodes.push(<span key={`${keyPrefix}-${i}`}>{node}</span>);
  }
  return nodes;
}

/** Calcula o offset de uma seleção relativo a UM bloco específico (parágrafo/item/pergunta). */
export function getBlockSelectionOffsets(blockEl: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!blockEl.contains(range.commonAncestorContainer)) return null;

  const preRange = document.createRange();
  preRange.selectNodeContents(blockEl);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;
  const text = range.toString();
  const end = start + text.length;
  if (end <= start || !text.trim()) return null;
  return { start, end };
}

type ContentType = "resumo" | "caso_clinico" | "revisao";

/** Busca e grava os grifos de uma aba (por bloco), com checagem de sobreposição embutida. */
export function useHighlights(topicId: string, contentType: ContentType, caseId: string | undefined, maskMode: boolean) {
  const queryClient = useQueryClient();
  const queryKey = ["highlights", topicId, contentType, caseId ?? null];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from("highlights")
        .select("id, block_index, start_offset, end_offset")
        .eq("topic_id", topicId)
        .eq("content_type", contentType);
      q = caseId ? q.eq("case_id", caseId) : q.is("case_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async (r: { blockIndex: number; start: number; end: number }) => {
      const { error } = await supabase.from("highlights").insert({
        topic_id: topicId,
        content_type: contentType,
        case_id: caseId ?? null,
        block_index: r.blockIndex,
        start_offset: r.start,
        end_offset: r.end,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (highlightId: string) => {
      const { error } = await supabase.from("highlights").delete().eq("id", highlightId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  function rangesFor(blockIndex: number): HighlightRange[] {
    if (!maskMode) return [];
    return (query.data ?? [])
      .filter((h) => h.block_index === blockIndex)
      .map((h) => ({ id: h.id, start: h.start_offset, end: h.end_offset }));
  }

  function allRangesFor(blockIndex: number): HighlightRange[] {
    return (query.data ?? [])
      .filter((h) => h.block_index === blockIndex)
      .map((h) => ({ id: h.id, start: h.start_offset, end: h.end_offset }));
  }

  function onSelect(blockIndex: number, offsets: { start: number; end: number }) {
    if (overlapsExisting(offsets.start, offsets.end, allRangesFor(blockIndex))) {
      toast.info("Esse trecho já tem um grifo.");
      return;
    }
    add.mutate({ blockIndex, ...offsets });
  }

  return { rangesFor, onSelect, onRemove: (id: string) => remove.mutate(id) };
}

/** Um parágrafo/item/pergunta grifável: renderiza o texto (com grifos) e captura seleção.
 *  O gatilho fica no próprio elemento de bloco (p/li), cobrindo toda a área — não num
 *  <span> interno, que deixaria um vão nas entrelinhas onde soltar o mouse não faz nada. */
export function HighlightableBlock({
  as = "p",
  blockIndex,
  text,
  ranges,
  onSelect,
  onRemove,
  className,
}: {
  as?: "p" | "li";
  blockIndex: number;
  text: string;
  ranges: HighlightRange[];
  onSelect: (blockIndex: number, offsets: { start: number; end: number }) => void;
  onRemove?: (id: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  function handleMouseUp() {
    if (!ref.current) return;
    const offsets = getBlockSelectionOffsets(ref.current);
    window.getSelection()?.removeAllRanges();
    if (!offsets) return;
    onSelect(blockIndex, offsets);
  }
  const content = renderHighlighted(text, ranges, `b${blockIndex}`, onRemove);
  if (as === "li") {
    return (
      <li ref={ref as React.RefObject<HTMLLIElement>} onMouseUp={handleMouseUp} className={className}>
        {content}
      </li>
    );
  }
  return (
    <p ref={ref as React.RefObject<HTMLParagraphElement>} onMouseUp={handleMouseUp} className={className}>
      {content}
    </p>
  );
}