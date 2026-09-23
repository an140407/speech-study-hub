function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineHtml(text: string): string {
  // Só existe **negrito** no texto gerado pela IA.
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

/** Converte o markdown simples do resumo gerado por IA (headings, listas, **negrito**)
 *  em HTML compatível com o schema padrão do TipTap (StarterKit). Usado uma única vez
 *  por tópico, na primeira vez que o resumo é aberto no editor. */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let para: string[] = [];

  const flushList = () => {
    if (!list) return;
    const tag = list.type;
    out.push(`<${tag}>${list.items.map((it) => `<li><p>${inlineHtml(it)}</p></li>`).join("")}</${tag}>`);
    list = null;
  };
  const flushPara = () => {
    if (para.length === 0) return;
    out.push(`<p>${inlineHtml(para.join(" "))}</p>`);
    para = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^[-*•]\s+(.*)$/);
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (h) {
      flushList();
      flushPara();
      const lvl = h[1]!.length;
      const content = inlineHtml(h[2]!.replace(/\*\*/g, ""));
      out.push(lvl >= 3 ? `<h3>${content}</h3>` : `<h2>${content}</h2>`);
    } else if (ul || ol) {
      flushPara();
      const type = ul ? "ul" : "ol";
      const item = (ul ?? ol)![1]!;
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(item);
    } else if (line === "") {
      flushList();
      flushPara();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushList();
  flushPara();
  return out.join("") || "<p></p>";
}