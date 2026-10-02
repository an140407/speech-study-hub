import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import type { GeneratedMaterial } from "./study-types";
import { uploadPdfToGeminiFiles } from "./gemini.server";
import { aiBusyError, isBusyStatus } from "./ai-busy";

export const BUCKET = "source-files";
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
export type SourceKind = "pdf" | "pptx";

export const MIME: Record<SourceKind, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- Storage (só servidor)

export async function findSourceFile(hash: string) {
  const { data } = await supabaseAdmin
    .from("source_files")
    .select("hash, kind, storage_path, text")
    .eq("hash", hash)
    .maybeSingle();
  return data;
}

export async function downloadObject(path: string): Promise<Uint8Array> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("Não foi possível ler o arquivo enviado.");
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeObjects(paths: string[]) {
  if (paths.length) await supabaseAdmin.storage.from(BUCKET).remove(paths);
}

/** Arquivos temporários ficam numa pasta por usuário: ninguém lê, usa ou apaga o envio de outra pessoa. */
export function userIncomingPrefix(userId: string) {
  return `incoming/${userId}/`;
}

export function assertOwnUpload(userId: string, path: string) {
  if (!path.startsWith(userIncomingPrefix(userId))) throw new Error("Arquivo enviado inválido.");
}

/** Apaga um envio temporário só depois de confirmar que ele está na pasta do próprio usuário.
 *  Todo caminho que vem do navegador passa por aqui, nunca direto por removeObjects. */
export async function removeOwnUpload(userId: string, path: string) {
  assertOwnUpload(userId, path);
  await removeObjects([path]);
}

/** Apaga envios temporários esquecidos (a pessoa desistiu no meio) com mais de 1 hora. */
export async function cleanupStaleIncoming(userId: string) {
  const folder = userIncomingPrefix(userId).slice(0, -1);
  const { data } = await supabaseAdmin.storage.from(BUCKET).list(folder, { limit: 100 });
  const cutoff = Date.now() - 60 * 60 * 1000;
  const stale = (data ?? [])
    .filter((o) => o.created_at && new Date(o.created_at).getTime() < cutoff)
    .map((o) => `${folder}/${o.name}`);
  await removeObjects(stale);
}

export async function createUploadUrl(kind: SourceKind, userId: string) {
  const path = `${userIncomingPrefix(userId)}${crypto.randomUUID()}.${kind}`;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error("Não foi possível preparar o envio do arquivo.");
  return { path, token: data.token };
}

// ---------------------------------------------------------------- Prova de posse
// "Usuário X provou que tem o arquivo H": só é registrado depois que o servidor recebe os bytes e
// confere a impressão digital. Toda ação sobre um arquivo guardado exige esse registro.

export async function addClaim(userId: string, hash: string) {
  await supabaseAdmin.from("source_claims").upsert({ user_id: userId, hash }, { ignoreDuplicates: true });
}

export async function hasClaim(userId: string, hash: string) {
  const { data } = await supabaseAdmin
    .from("source_claims")
    .select("hash")
    .eq("user_id", userId)
    .eq("hash", hash)
    .maybeSingle();
  return !!data;
}

/** Guarda o PDF final (original ou convertido) com o nome = impressão digital do arquivo enviado. */
export async function storeSourcePdf(hash: string, kind: SourceKind, pdf: Uint8Array, text: string) {
  // Defesa extra: nada que não seja PDF de verdade entra no bucket.
  if (!isPdfBytes(pdf)) throw new Error("O arquivo não é um PDF válido.");
  const storage_path = `pdf/${hash}.pdf`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storage_path, pdf, { contentType: MIME.pdf, upsert: true });
  if (error) throw new Error("Não foi possível guardar o arquivo.");
  await supabaseAdmin
    .from("source_files")
    .upsert({ hash, kind, storage_path, size_bytes: pdf.length, text: text || null });
  return storage_path;
}

/** Apaga o arquivo guardado só se nenhum tópico (de ninguém) apontar mais pra ele. */
export async function releaseSourceFile(hash: string) {
  const { count } = await supabaseAdmin
    .from("topics")
    .select("id", { count: "exact", head: true })
    .eq("source_hash", hash);
  if ((count ?? 0) > 0) return;
  const file = await findSourceFile(hash);
  if (!file) return;
  await supabaseAdmin.from("source_files").delete().eq("hash", hash);
  await removeObjects([file.storage_path]);
}

export async function saveSummaryHtml(topicId: string, html: string) {
  const { data } = await supabaseAdmin
    .from("materials")
    .update({ content: { html } })
    .eq("topic_id", topicId)
    .eq("type", "summary")
    .select("id");
  if (!data?.length) {
    await supabaseAdmin.from("materials").insert({ topic_id: topicId, type: "summary", content: { html } });
  }
}

/** Transcrição chega depois (etapa em segundo plano): salva no tópico e no cache do arquivo guardado. */
export async function saveTopicSourceText(topicId: string, text: string, hash: string | null) {
  await supabaseAdmin.from("topics").update({ source_text: text }).eq("id", topicId);
  if (hash) {
    await supabaseAdmin.from("source_files").update({ text }).eq("hash", hash).is("text", null);
  }
}

export async function signedSourceUrl(path: string) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data) throw new Error("Não foi possível abrir o material original.");
  return data.signedUrl;
}

export async function setTopicSource(
  topicId: string,
  fields: { source_kind: SourceKind; source_name: string; source_text: string; source_hash: string | null },
) {
  await supabaseAdmin.from("topics").update(fields).eq("id", topicId);
}

// ---------------------------------------------------------------- Conversão PPTX → PDF
// Cloudmersive (plano gratuito: arquivos até 3,5MB, 600/mês) pros pequenos;
// CloudConvert (plano gratuito: até 1GB, 10/dia) pros maiores, em modo assíncrono.

const CLOUDMERSIVE_MAX_BYTES = 3.5 * 1024 * 1024;

export function isPdfBytes(bytes: Uint8Array) {
  return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}

/** PPTX é um zip: começa com "PK\x03\x04". A estrutura interna é conferida na extração dos slides. */
export function isZipBytes(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function assertPdf(bytes: Uint8Array) {
  if (!isPdfBytes(bytes)) throw new Error("A conversão não devolveu um PDF válido.");
}

export function canConvertInline(size: number) {
  return size <= CLOUDMERSIVE_MAX_BYTES && !!process.env["CLOUDMERSIVE_API_KEY"];
}

export async function convertWithCloudmersive(pptx: Uint8Array): Promise<Uint8Array> {
  const key = process.env["CLOUDMERSIVE_API_KEY"];
  if (!key) throw new Error("CLOUDMERSIVE_API_KEY não configurada.");
  const form = new FormData();
  form.append("inputFile", new Blob([pptx as BlobPart], { type: MIME.pptx }), "aula.pptx");
  const res = await fetch("https://api.cloudmersive.com/convert/pptx/to/pdf", {
    method: "POST",
    headers: { Apikey: key },
    body: form,
  });
  if (!res.ok) {
    console.error("Cloudmersive error", res.status, (await res.text()).slice(0, 300));
    throw new Error(`Cloudmersive recusou a conversão (erro ${res.status}).`);
  }
  const out = new Uint8Array(await res.arrayBuffer());
  assertPdf(out);
  return out;
}

const CC_HEADERS = { "User-Agent": "FonoLab/1.0 (+https://lovable.dev)", Accept: "application/json" };

function cloudConvertKey() {
  const key = process.env["CLOUDCONVERT_API_KEY"];
  if (!key) throw new Error("PPTX acima de 3,5MB precisa da CloudConvert, e a CLOUDCONVERT_API_KEY não está configurada.");
  return key;
}

/** Cria o job na CloudConvert (volta na hora). A CloudConvert busca o PPTX por um link temporário do Storage. */
export async function startCloudConvertJob(storagePath: string, ownerTag: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  if (error || !data) throw new Error("Não foi possível preparar o arquivo pra conversão.");
  const res = await fetch("https://api.cloudconvert.com/v2/jobs", {
    method: "POST",
    headers: { Authorization: `Bearer ${cloudConvertKey()}`, "Content-Type": "application/json", ...CC_HEADERS },
    body: JSON.stringify({
      tasks: {
        "import-pptx": { operation: "import/url", url: data.signedUrl, filename: "aula.pptx" },
        "convert-pdf": { operation: "convert", input: "import-pptx", input_format: "pptx", output_format: "pdf" },
        "export-pdf": { operation: "export/url", input: "convert-pdf" },
      },
      tag: ownerTag,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("CloudConvert create error", res.status, body.slice(0, 500));
    throw new Error(`CloudConvert recusou a conversão (erro ${res.status}${cloudConvertMessage(body)})`);
  }
  const job = (await res.json()) as { data?: { id?: string } };
  if (!job.data?.id) throw new Error("CloudConvert não devolveu o job.");
  return job.data.id;
}

/** Extrai a mensagem de erro que a própria CloudConvert devolve, pra mostrar o motivo real no aviso. */
function cloudConvertMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; code?: string };
    const msg = [parsed.code, parsed.message].filter(Boolean).join(": ");
    if (msg) return ` — ${msg.slice(0, 200)}`;
  } catch {
    // não é JSON: provavelmente uma página HTML de bloqueio (firewall)
  }
  const title = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
  if (title) return ` — página de bloqueio: "${title.slice(0, 120)}"`;
  const text = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? ` — ${text.slice(0, 120)}` : "";
}

type CCTask = { operation: string; status: string; message?: string; result?: { files?: { url: string }[] } };

/** Consulta o job: "pending" enquanto processa; o PDF quando termina; erro com o motivo quando falha. */
export async function checkCloudConvertJob(
  jobId: string,
  ownerTag: string,
): Promise<{ status: "pending" } | { status: "done"; pdf: Uint8Array }> {
  const res = await fetch(`https://api.cloudconvert.com/v2/jobs/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${cloudConvertKey()}`, ...CC_HEADERS },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("CloudConvert poll error", res.status, body.slice(0, 500));
    throw new Error(`Falha ao consultar a conversão (erro ${res.status}${cloudConvertMessage(body)})`);
  }
  const job = (await res.json()) as { data?: { status?: string; tag?: string; tasks?: CCTask[] } };
  // Só quem iniciou a conversão (mesmo tópico e mesmo arquivo) pode consultar o resultado.
  if (job.data?.tag !== ownerTag) throw new Error("Conversão não encontrada.");
  const status = job.data?.status;
  if (status === "error") {
    const failed = job.data?.tasks?.find((t) => t.status === "error");
    throw new Error(`A conversão falhou${failed?.message ? `: ${failed.message}` : "."}`);
  }
  if (status !== "finished") return { status: "pending" };
  const url = job.data?.tasks?.find((t) => t.operation === "export/url")?.result?.files?.[0]?.url;
  if (!url) throw new Error("A conversão terminou sem arquivo de saída.");
  const pdfRes = await fetch(url);
  if (!pdfRes.ok) throw new Error("Não foi possível baixar o PDF convertido.");
  const pdf = new Uint8Array(await pdfRes.arrayBuffer());
  assertPdf(pdf);
  return { status: "done", pdf };
}

export async function linkTopicSource(topicId: string, hash: string) {
  await supabaseAdmin.from("topics").update({ source_hash: hash }).eq("id", topicId);
}

// ---------------------------------------------------------------- Gemini: transcrição e resumo

const FAST_MODEL = "gemini-3.1-flash-lite";
const STRONG_MODEL = "gemini-3.5-flash";

type Part = { text: string } | { file_data: { mime_type: string; file_uri: string } };

async function geminiText(model: string, system: string, parts: Part[]): Promise<{ text: string; cut: boolean }> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("Essa função exige a chave própria do Gemini (GEMINI_API_KEY) nos Secrets.");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 50000 },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Gemini ${model} error`, res.status, body.slice(0, 500));
    if (isBusyStatus(res.status)) throw aiBusyError(res.status);
    const err = new Error(`Erro na API do Gemini (${res.status}).`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  };
  const c = json.candidates?.[0];
  const text = (c?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  return { text, cut: c?.finishReason === "MAX_TOKENS" };
}

export async function uploadToGemini(pdf: Uint8Array): Promise<string> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("Essa função exige a chave própria do Gemini (GEMINI_API_KEY) nos Secrets.");
  return uploadPdfToGeminiFiles(pdf, key);
}

const TRANSCRIBE_PROMPT = `Transcreva em português o conteúdo do material de aula anexado, do início ao fim e na mesma ordem.
Preserve títulos, listas, números, classificações, siglas e nomes de testes/instrumentos.
Tabelas: reproduza como texto, uma linha por linha da tabela.
Figuras e diagramas relevantes: descreva em uma frase entre colchetes.
Não resuma, não comente, não acrescente nada que não esteja no material. Responda só com a transcrição.`;

/** Transcrição fiel do PDF (fica salva no tópico pra gerar o resumo depois, mesmo sem guardar o arquivo). */
export async function transcribePdf(fileUri: string): Promise<string> {
  const { text } = await geminiText(FAST_MODEL, TRANSCRIBE_PROMPT, [
    { text: "Transcreva este material." },
    { file_data: { mime_type: MIME.pdf, file_uri: fileUri } },
  ]);
  return text.trim();
}

const SUMMARY_PROMPT = `Você é professor universitário de Fonoaudiologia no Brasil. Escreva um resumo de estudo em português do Brasil, nível graduação, completo e detalhado.

FORMATO (obrigatório): responda SOMENTE com um fragmento HTML, sem <html>, <head>, <body>, sem markdown e sem blocos de código.
Tags permitidas: h2, h3, p, ul, ol, li, strong, em, table, thead, tbody, tr, th, td. A primeira linha de toda tabela usa <th>.

ESTRUTURA (cada item é um <h2>, nesta ordem; se um item realmente não se aplicar ao tema, adapte o título ou omita — nunca invente conteúdo):
1. Definição e conceitos — inclua a etimologia simples de uma ou duas palavras centrais, no formato "<strong>palavra</strong>: do grego/latim <em>raiz</em> (significado) + ...". Só inclua etimologia se tiver certeza da origem; se não tiver, omita.
2. Anatomia e fisiologia
3. Fisiopatologia e etiologia
4. Manifestações clínicas
5. Avaliação fonoaudiológica — cite testes, protocolos e instrumentos pelo nome
6. Conduta e terapia
7. Correlação clínica
8. Pontos-chave para a prova — lista
9. Termos importantes — lista no formato "<strong>termo</strong>: definição curta"

Use <h3> para subdivisões e tabelas sempre que houver comparação, classificação ou graus (ex.: tipos de perda auditiva, escalas).`;

function cleanHtml(raw: string): string {
  let html = raw.trim();
  const fence = html.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) html = fence[1].trim();
  html = html
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?(html|head|body)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
  if (!html.includes("<")) throw new Error("A IA não devolveu o resumo no formato esperado. Tente de novo.");
  return html;
}

export type SummarySource =
  | { type: "pdf"; fileUri: string }
  | { type: "text"; text: string }
  | { type: "title" };

export async function generateSummaryHtml(title: string, source: SummarySource): Promise<string> {
  const length =
    source.type === "title"
      ? "Tamanho: entre 1.500 e 2.000 palavras."
      : "Tamanho: proporcional ao material, entre 1.500 e 3.000 palavras. Siga a ordem da aula, cubra TODOS os subtópicos e preserve números, classificações e nomes citados. Ignore conteúdo administrativo (ementa, cronograma, critérios de avaliação).";

  const parts: Part[] =
    source.type === "pdf"
      ? [
          { text: `Tema: "${title}". ${length} Baseie-se no material anexado.` },
          { file_data: { mime_type: MIME.pdf, file_uri: source.fileUri } },
        ]
      : source.type === "text"
        ? [{ text: `Tema: "${title}". ${length} Baseie-se neste conteúdo da aula:\n\n${source.text}` }]
        : [{ text: `Tema: "${title}". ${length}` }];

  let result: { text: string; cut: boolean };
  try {
    result = await geminiText(STRONG_MODEL, SUMMARY_PROMPT, parts);
  } catch (e) {
    // Modelo forte indisponível, sem cota ou sobrecarregado: cai no modelo rápido.
    const status = (e as { status?: number }).status;
    if (status && [403, 404, 429, 500, 503].includes(status)) {
      result = await geminiText(FAST_MODEL, SUMMARY_PROMPT, parts);
    } else {
      throw e;
    }
  }
  if (result.cut) console.warn("Resumo cortado pelo limite de tokens; salvando o que veio.");
  return cleanHtml(result.text);
}

// ---------------------------------------------------------------- Salvar material gerado

export async function saveGeneratedMaterial(
  supabase: SupabaseClient<Database>,
  topicTitle: string,
  material: GeneratedMaterial,
): Promise<string> {
  const { data: topic_id, error } = await supabase.rpc("save_generated_material", {
    p_topic: topicTitle,
    p_summary: "",
    p_mindmap: material.mindmap,
    p_clinical_case: material.clinical_case,
    p_review_questions: material.review_questions,
    p_flashcards: material.flashcards,
    p_mcq: material.mcq,
  });
  if (error || !topic_id) {
    console.error(error);
    throw new Error("Não foi possível salvar o material. Sua sessão pode ter expirado — tente entrar de novo.");
  }
  return topic_id as string;
}