import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateStudyMaterialFromPdfUri, generateStudyMaterialFromText } from "./gemini.server";
import { extractPptxText } from "./pptx.server";
import {
  MAX_SOURCE_BYTES,
  cleanupStaleIncoming,
  canConvertInline,
  checkCloudConvertJob,
  convertWithCloudmersive,
  linkTopicSource,
  startCloudConvertJob,
  createUploadUrl,
  downloadObject,
  findSourceFile,
  generateSummaryHtml,
  releaseSourceFile,
  removeObjects,
  saveGeneratedMaterial,
  saveSummaryHtml,
  saveTopicSourceText,
  setTopicSource,
  sha256Hex,
  signedSourceUrl,
  storeSourcePdf,
  transcribePdf,
  uploadToGemini,
  type SourceKind,
  type SummarySource,
} from "./source.server";

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/, "Impressão digital inválida.");
const kindSchema = z.enum(["pdf", "pptx"]);

/** Passo 1 do envio: se o arquivo idêntico já está guardado, não precisa enviar de novo. */
export const prepareSourceUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ hash: hashSchema, kind: kindSchema, size: z.number().int().positive().max(MAX_SOURCE_BYTES) }).parse(input),
  )
  .handler(async ({ data }) => {
    await cleanupStaleIncoming().catch(() => undefined);
    const existing = await findSourceFile(data.hash);
    if (existing) return { mode: "existing" as const };
    const { path, token } = await createUploadUrl(data.kind);
    return { mode: "upload" as const, path, token };
  });

const FILE_URI_RE = /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/files\/[A-Za-z0-9_-]+$/;

/** Etapa 1 (curta): verifica o arquivo, envia pro Gemini, guarda/converte se pedido e apaga o temporário.
 *  Não gera nada com IA aqui, pra caber no tempo máximo de uma requisição. */
export const ingestSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        hash: hashSchema,
        kind: kindSchema,
        keep: z.boolean(),
        upload_path: z.string().regex(/^incoming\/[0-9a-f-]{36}\.(pdf|pptx)$/).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const warnings: string[] = [];
    let keepUpload = false;
    try {
      const existing = await findSourceFile(data.hash);
      const kind: SourceKind = existing?.kind === "pdf" || existing?.kind === "pptx" ? existing.kind : data.kind;

      // Cópia já guardada por alguém: reaproveita sem novo envio.
      if (!data.upload_path) {
        if (!existing) throw new Error("Arquivo não encontrado. Envie de novo.");
        if (kind === "pptx" && existing.text) return { file_uri: null, text: existing.text, convert_path: null, warning: null };
        const fileUri = await uploadToGemini(await downloadObject(existing.storage_path));
        return { file_uri: fileUri, text: existing.text ?? null, convert_path: null, warning: null };
      }

      const bytes = await downloadObject(data.upload_path);
      if (bytes.length > MAX_SOURCE_BYTES) throw new Error("Arquivo maior que 50MB.");
      if ((await sha256Hex(bytes)) !== data.hash) {
        throw new Error("O arquivo enviado não confere com o original. Tente enviar de novo.");
      }

      if (kind === "pdf") {
        const fileUri = await uploadToGemini(bytes);
        if (data.keep && !existing) {
          await storeSourcePdf(data.hash, "pdf", bytes, "").catch((e) => {
            console.error("Falha ao guardar", e);
            warnings.push("Não foi possível guardar o arquivo original — o tópico será criado sem a prévia.");
          });
        }
        return { file_uri: fileUri, text: null, convert_path: null, warning: warnings.join(" ") || null };
      }

      const text = await extractPptxText(bytes);
      // A conversão roda depois, em segundo plano (pode demorar): o PPTX fica no temporário até lá.
      const convertPath = data.keep && !existing ? data.upload_path : null;
      keepUpload = !!convertPath;
      return { file_uri: null, text, convert_path: convertPath, warning: null };
    } finally {
      if (data.upload_path && !keepUpload) await removeObjects([data.upload_path]).catch(() => undefined);
    }
  });

/** Etapa 2: gera o material com IA e cria o tópico (liga ao arquivo guardado só se ele existir de fato). */
export const createTopicFromSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        hash: hashSchema,
        kind: kindSchema,
        name: z.string().trim().min(1).max(200),
        keep: z.boolean(),
        file_uri: z.string().regex(FILE_URI_RE).nullable(),
        text: z.string().max(300_000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const material = data.file_uri
      ? await generateStudyMaterialFromPdfUri(data.file_uri)
      : data.text?.trim()
        ? await generateStudyMaterialFromText(data.text)
        : null;
    if (!material) throw new Error("Não foi possível ler o conteúdo do arquivo.");

    const topic_id = await saveGeneratedMaterial(context.supabase, material.topic_title, material);
    const stored = data.keep ? await findSourceFile(data.hash) : null;
    await setTopicSource(topic_id, {
      source_kind: data.kind,
      source_name: data.name,
      source_text: data.text ?? "",
      source_hash: stored ? data.hash : null,
    });
    return { topic_id, needs_transcription: !!data.file_uri && !data.text?.trim() };
  });

/** Etapa 3 (segundo plano): transcreve o PDF pra o resumo sob demanda ter o conteúdo da aula. */
export const transcribeTopicSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ topic_id: z.string().uuid(), file_uri: z.string().regex(FILE_URI_RE) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: topic } = await context.supabase
      .from("topics")
      .select("id, source_hash")
      .eq("id", data.topic_id)
      .maybeSingle();
    if (!topic) throw new Error("Tópico não encontrado.");
    const text = await transcribePdf(data.file_uri);
    if (text) await saveTopicSourceText(topic.id, text, topic.source_hash);
    return { ok: true };
  });

const convertInput = z.object({
  topic_id: z.string().uuid(),
  hash: hashSchema,
  upload_path: z.string().regex(/^incoming\/[0-9a-f-]{36}\.pptx$/),
});

async function assertOwnTopic(supabase: SupabaseClient<Database>, topicId: string) {
  const { data } = await supabase.from("topics").select("id, source_text, source_hash").eq("id", topicId).maybeSingle();
  if (!data) throw new Error("Tópico não encontrado.");
  return data;
}

async function finishConversion(topicId: string, hash: string, pdf: Uint8Array, text: string | null, uploadPath: string) {
  await storeSourcePdf(hash, "pptx", pdf, text ?? "");
  await linkTopicSource(topicId, hash);
  await removeObjects([uploadPath]).catch(() => undefined);
}

/** Etapa 4a (segundo plano): converte o PPTX guardado. Pequeno: resolve na hora. Grande: abre um job e
 *  devolve o id pra o navegador acompanhar em chamadas curtas. */
export const startTopicConversion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => convertInput.parse(input))
  .handler(async ({ data, context }) => {
    const topic = await assertOwnTopic(context.supabase, data.topic_id);
    try {
      const existing = await findSourceFile(data.hash);
      if (existing) {
        await linkTopicSource(topic.id, data.hash);
        await removeObjects([data.upload_path]).catch(() => undefined);
        return { status: "done" as const, job_id: null };
      }
      const bytes = await downloadObject(data.upload_path);
      if ((await sha256Hex(bytes)) !== data.hash) throw new Error("O arquivo enviado não confere com o original.");
      if (canConvertInline(bytes.length)) {
        await finishConversion(topic.id, data.hash, await convertWithCloudmersive(bytes), topic.source_text, data.upload_path);
        return { status: "done" as const, job_id: null };
      }
      return { status: "pending" as const, job_id: await startCloudConvertJob(data.upload_path) };
    } catch (e) {
      await removeObjects([data.upload_path]).catch(() => undefined);
      throw e;
    }
  });

/** Etapa 4b (segundo plano): consulta o job; quando termina, guarda o PDF e liga ao tópico. */
export const pollTopicConversion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => convertInput.extend({ job_id: z.string().min(1).max(100) }).parse(input))
  .handler(async ({ data, context }) => {
    const topic = await assertOwnTopic(context.supabase, data.topic_id);
    try {
      const res = await checkCloudConvertJob(data.job_id);
      if (res.status === "pending") return { status: "pending" as const };
      await finishConversion(topic.id, data.hash, res.pdf, topic.source_text, data.upload_path);
      return { status: "done" as const };
    } catch (e) {
      await removeObjects([data.upload_path]).catch(() => undefined);
      throw e;
    }
  });

/** Link temporário (10 min) do PDF guardado — só pra quem tem esse arquivo num tópico próprio. */
export const getSourceFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ topic_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: topic } = await context.supabase
      .from("topics")
      .select("source_hash")
      .eq("id", data.topic_id)
      .maybeSingle();
    if (!topic?.source_hash) throw new Error("Esse tópico não tem material original guardado.");
    const file = await findSourceFile(topic.source_hash);
    if (!file) throw new Error("O material original não está mais disponível.");
    return { url: await signedSourceUrl(file.storage_path) };
  });

/** Resumo sob demanda (modelo mais forte), a partir do arquivo guardado, do texto salvo, ou só do título. */
export const generateSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ topic_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: topic } = await context.supabase
      .from("topics")
      .select("id, title, source_hash, source_text")
      .eq("id", data.topic_id)
      .maybeSingle();
    if (!topic) throw new Error("Tópico não encontrado.");

    let source: SummarySource = { type: "title" };
    const file = topic.source_hash ? await findSourceFile(topic.source_hash) : null;
    if (file) {
      source = { type: "pdf", fileUri: await uploadToGemini(await downloadObject(file.storage_path)) };
    } else if (topic.source_text?.trim()) {
      source = { type: "text", text: topic.source_text };
    }

    const html = await generateSummaryHtml(topic.title, source);
    await saveSummaryHtml(topic.id, html);
    return { html };
  });

/** Exclui o tópico e libera o arquivo guardado se ninguém mais usar. */
export const deleteTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ topic_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: topic } = await context.supabase
      .from("topics")
      .select("id, source_hash")
      .eq("id", data.topic_id)
      .maybeSingle();
    if (!topic) throw new Error("Tópico não encontrado.");
    const { error } = await context.supabase.from("topics").delete().eq("id", topic.id);
    if (error) throw new Error("Falha ao excluir o tópico.");
    if (topic.source_hash) await releaseSourceFile(topic.source_hash).catch((e) => console.error(e));
    return { ok: true };
  });