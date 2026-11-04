/** A resposta do tutor guarda, no fim, uma marca escondida com as seções citadas do resumo. */
export const SECTIONS_MARK = /<!--secoes:(\[[\s\S]*?\])-->\s*$/;

export function parseAnswer(content: string): { html: string; sections: string[] } {
  const m = content.match(SECTIONS_MARK);
  let sections: string[] = [];
  if (m?.[1]) {
    try {
      const parsed = JSON.parse(m[1]) as unknown;
      if (Array.isArray(parsed)) sections = parsed.map(String);
    } catch {
      // marca estragada: mostra a resposta sem as seções
    }
  }
  return { html: content.replace(SECTIONS_MARK, ""), sections };
}
