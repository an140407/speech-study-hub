/**
 * Limpa o HTML que a IA devolve antes de ele entrar no resumo: só tags simples de
 * texto, listas e tabelas, sem atributos (nada de script, estilo ou link).
 * Funciona no servidor e no navegador (só usa expressões regulares).
 */

const ALLOWED = new Set([
  "p",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "h3",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "br",
]);

/** Mantém só tags simples e sem atributos (nada de script, estilo ou link). */
export function sanitizeStudyHtml(html: string): string {
  let out = String(html ?? "").trim();
  const fence = out.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) out = fence[1].trim();
  out = out
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, (tag, name: string) => {
      const n = name.toLowerCase();
      if (n === "h1" || n === "h2" || n === "h4") return tag.startsWith("</") ? "</h3>" : "<h3>";
      if (n === "b") return tag.startsWith("</") ? "</strong>" : "<strong>";
      if (n === "i") return tag.startsWith("</") ? "</em>" : "<em>";
      if (!ALLOWED.has(n)) return "";
      return tag.startsWith("</") ? `</${n}>` : `<${n}>`;
    })
    // **negrito** vira <strong>; *ênfase* que escapou vira texto comum
    .replace(/\*\*(?=\S)([^*\n<]+?)(?<=\S)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\w*])\*\*?(?=\S)([^*\n<]+?)(?<=\S)\*\*?(?![\w*])/g, "$1$2");
  if (!out.includes("<")) out = `<p>${out}</p>`;
  return out;
}
