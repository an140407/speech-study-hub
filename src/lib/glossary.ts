/**
 * Glossário: lê os termos da seção "Termos importantes" de cada resumo (formato
 * "<strong>termo</strong>: definição") e as etimologias de "Definição e conceitos"
 * ("<strong>palavra</strong>: do latim…"). Só expressões regulares: roda no servidor.
 */

export type GlossaryDefinition = {
  text: string;
  topicId: string;
  topicTitle: string;
  folderId: string | null;
};

export type GlossaryEntry = {
  key: string;
  term: string;
  etymology: string | null;
  definitions: GlossaryDefinition[];
};

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

export const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, " ")
    .trim();

/** Chave para juntar o mesmo termo de tópicos diferentes (sem acento, sem caixa). */
export const termKey = (term: string) =>
  term
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[.:;,\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Itens de lista (ou parágrafos, se não houver lista) de um trecho de HTML. */
function items(html: string) {
  const li = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1] ?? "");
  if (li.length) return li;
  return [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1] ?? "");
}

/** "termo: definição" de um item (com ou sem negrito no termo). */
function splitItem(inner: string): { term: string; rest: string } | null {
  const clean = inner.replace(/<\/?p[^>]*>/gi, " ").trim();
  const bold = clean.match(/^\s*<strong>([\s\S]*?)<\/strong>\s*([\s\S]*)$/i);
  if (bold) {
    const term = stripHtml(bold[1] ?? "")
      .replace(/[:\-–—]\s*$/, "")
      .trim();
    const rest = stripHtml(bold[2] ?? "")
      .replace(/^[:\-–—]\s*/, "")
      .trim();
    return term && rest ? { term, rest } : null;
  }
  const text = stripHtml(clean);
  const i = text.indexOf(":");
  if (i <= 0 || i > 60) return null;
  return { term: text.slice(0, i).trim(), rest: text.slice(i + 1).trim() };
}

function sections(html: string) {
  return html
    .split(/<h2[^>]*>/i)
    .slice(1)
    .map((part) => {
      const [title = "", ...rest] = part.split(/<\/h2>/i);
      return { title: stripHtml(title), body: rest.join("") };
    });
}

/** Termos da seção "Termos importantes" do resumo. */
export function extractTerms(html: string) {
  const out: { term: string; definition: string }[] = [];
  for (const s of sections(html)) {
    if (!/termos importantes|gloss[áa]rio/i.test(s.title)) continue;
    for (const inner of items(s.body)) {
      const it = splitItem(inner);
      if (!it || it.term.length > 80 || it.rest.length < 3) continue;
      out.push({ term: it.term, definition: it.rest });
    }
  }
  return out;
}

/**
 * Só a origem da palavra: "do latim exsudare (suar para fora)", sem o resto da frase
 * que às vezes vem colado ("…, caracterizando o líquido…"). Aceita "x (…) + y (…)".
 */
export function trimEtymology(text: string) {
  const m = text.match(/^do (?:latim|grego)[^()]*\([^)]*\)(?:\s*\+\s*[^()]*\([^)]*\))*/i);
  return (m?.[0] ?? text.split(/[.;]/)[0] ?? text).trim();
}

/** Etimologias ("palavra: do latim/grego …") em qualquer parte do resumo. */
export function extractEtymologies(html: string) {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<(p|li)[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const it = splitItem(m[2] ?? "");
    if (it && /^do (latim|grego)/i.test(it.rest)) out.set(termKey(it.term), trimEtymology(it.rest));
  }
  return out;
}

/** Junta os termos de vários tópicos numa lista em ordem alfabética. */
export function buildGlossary(
  topics: { id: string; title: string; folderId: string | null; html: string }[],
  clean: (text: string) => string = (t) => t,
): GlossaryEntry[] {
  const byKey = new Map<string, GlossaryEntry>();
  const etymologies = new Map<string, string>();
  for (const t of topics) {
    for (const [k, v] of extractEtymologies(t.html)) if (!etymologies.has(k)) etymologies.set(k, v);
    for (const { term, definition } of extractTerms(t.html)) {
      const key = termKey(term);
      if (!key) continue;
      const entry =
        byKey.get(key) ??
        byKey.set(key, { key, term: clean(term), etymology: null, definitions: [] }).get(key)!;
      const text = clean(definition);
      if (!entry.definitions.some((d) => termKey(d.text) === termKey(text))) {
        entry.definitions.push({ text, topicId: t.id, topicTitle: t.title, folderId: t.folderId });
      }
    }
  }
  for (const e of byKey.values()) e.etymology = etymologies.get(e.key) ?? null;
  return [...byKey.values()].sort((a, b) =>
    a.term.localeCompare(b.term, "pt-BR", { sensitivity: "base" }),
  );
}

/** Letra do índice A–Z (sem acento); números e símbolos ficam em "#". */
export const letterOf = (term: string) => {
  const c = termKey(term).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
};
