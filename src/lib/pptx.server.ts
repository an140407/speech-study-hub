import JSZip from "jszip";
import { base64ToUint8Array } from "./base64.server";

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Extrai só o texto das caixas de cada slide de um .pptx (é um zip com um XML por slide).
 *  Não lê imagens, diagramas nem formas sem texto — é a limitação real do formato aqui. */
export async function extractPptxText(base64: string): Promise<string> {
  const zip = await JSZip.loadAsync(base64ToUint8Array(base64));

  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      return na - nb;
    });

  if (slideFiles.length === 0) {
    throw new Error("Não encontrei slides nesse arquivo. Confirme se é um .pptx válido.");
  }

  const slides: string[] = [];
  for (const file of slideFiles) {
    const xml = await zip.files[file]!.async("string");
    const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => unescapeXml(m[1] ?? ""));
    const text = runs.join(" ").replace(/\s+/g, " ").trim();
    if (text) slides.push(text);
  }

  if (slides.length === 0) {
    throw new Error("Não encontrei texto nos slides — esse PPTX pode ser só imagens/diagramas.");
  }

  // Detecta divisores de aula/módulo/semana (comuns em decks de curso) pra pegar
  // exatamente um tema inteiro — nem cortando ele no meio, nem misturando com o
  // próximo. Se não achar nenhum divisor, usa o deck inteiro (sujeito ao teto abaixo).
  const DIVIDER_RE = /^(aula|módulo|modulo|unidade|semana|tema|capítulo|capitulo|parte)\s*\d+/i;
  const dividerIdx: number[] = [];
  slides.forEach((s, i) => { if (DIVIDER_RE.test(s)) dividerIdx.push(i); });

  const scoped =
    dividerIdx.length > 0
      ? slides.slice(dividerIdx[0], dividerIdx.length > 1 ? dividerIdx[1] : slides.length)
      : slides;

  // Teto de segurança (bem mais generoso agora que o corte principal já é por tema,
  // não por tamanho) — só entra em ação se um único tema/aula ainda assim for enorme.
  const MAX_CHARS = 40000;
  const kept: string[] = [];
  let total = 0;
  let truncated = false;
  for (const s of scoped) {
    if (total + s.length > MAX_CHARS && kept.length > 0) {
      truncated = true;
      break;
    }
    kept.push(s);
    total += s.length;
  }

  const body = kept.map((s, i) => `Slide ${i + 1}: ${s}`).join("\n\n");
  return truncated
    ? `${body}\n\n[Restante do arquivo omitido por ser extenso demais. Gere material só sobre o assunto técnico já apresentado até aqui.]`
    : body;
}