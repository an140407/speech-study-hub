import JSZip from "jszip";

function base64ToUint8Array(base64: string): Uint8Array {
  // Buffer existe no Node; no runtime do Cloudflare Workers cai no atob.
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(base64, "base64"));
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

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

  return slides.map((s, i) => `Slide ${i + 1}: ${s}`).join("\n\n");
}