/** Motor de grifo: calcula offsets de uma seleção de texto e reaplica marcações numa árvore DOM já renderizada. */

export function getSelectionOffsets(container: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  // Não permite grifo que toque títulos — evita quebrar a estrutura do markdown renderizado.
  const headings = container.querySelectorAll("h1, h2, h3, h4, h5, h6");
  for (const h of Array.from(headings)) {
    if (range.intersectsNode(h)) return null;
  }

  const preRange = document.createRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;
  const text = range.toString();
  const end = start + text.length;
  if (end <= start || !text.trim()) return null;
  return { start, end };
}

/** true se [start,end) sobrepõe algum intervalo já existente. */
export function overlapsExisting(
  start: number,
  end: number,
  existing: { start: number; end: number }[],
): boolean {
  return existing.some((r) => start < r.end && end > r.start);
}

function offsetsToRange(container: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let startNode: Text | null = null;
  let startOff = 0;
  let endNode: Text | null = null;
  let endOff = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node as Text;
    const len = text.length;
    if (startNode === null && pos + len >= start) {
      startNode = text;
      startOff = start - pos;
    }
    if (endNode === null && pos + len >= end) {
      endNode = text;
      endOff = end - pos;
      break;
    }
    pos += len;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOff);
  range.setEnd(endNode, endOff);
  return range;
}

/** Remove todos os <mark> de grifo do container, devolvendo o texto ao normal (sem apagar do banco). */
export function clearHighlightMarks(container: HTMLElement) {
  container.querySelectorAll("mark[data-highlight-id]").forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    parent.normalize();
  });
}

export function applyHighlights(
  container: HTMLElement,
  ranges: { id: string; start: number; end: number }[],
) {
  clearHighlightMarks(container);
  const headings = Array.from(container.querySelectorAll("h1, h2, h3, h4, h5, h6"));
  // Processa do fim pro começo pra não invalidar offsets já calculados.
  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  for (const r of sorted) {
    try {
      const range = offsetsToRange(container, r.start, r.end);
      if (!range) continue;
      if (headings.some((h) => range.intersectsNode(h))) continue; // grifo antigo/corrompido que cruza título
      const mark = document.createElement("mark");
      mark.className = "fono-highlight";
      mark.dataset["highlightId"] = r.id;
      try {
        range.surroundContents(mark);
      } catch {
        // A seleção cruza limites de elemento (ex.: metade de um <strong>) —
        // extrai o conteúdo e reinsere dentro do <mark> manualmente.
        const frag = range.extractContents();
        mark.appendChild(frag);
        range.insertNode(mark);
      }
    } catch (e) {
      console.error("Falha ao aplicar um grifo, pulando", r, e);
    }
  }
}