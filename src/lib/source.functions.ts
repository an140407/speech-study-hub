import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateStudyMaterialFromPdfUri, generateStudyMaterialFromText } from "./gemini.server";
import { extractPptxText } from "./pptx.server";
import {
  MAX_SOURCE_BYTES,
  cleanupStaleIncoming,
  convertPptxToPdf,
  createUploadUrl,
  downloadObject,
  findSourceFile,
  generateSummaryHtml,
  releaseSourceFile,
  removeObjects,
  saveGeneratedMaterial,
  saveSummaryHtml,
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

/** Passo 2: verifica, gera o material, guarda (ou não) o arquivo e apaga o temporário. */
export const generateMaterialFromSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        hash: hashSchema,
        kind: kindSchema,
        name: z.string().trim().min(1).max(200),
        keep: z.boolean(),
        upload_path: z.string().regex(/^incoming\/[0-9a-f-]{36}\.(pdf|pptx)$/).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const warnings: string[] = [];
    try {
      const existing = await findSourceFile(data.hash);
      let bytes: Uint8Array | null = null;

      if (data.upload_path) {
        bytes = await downloadObject(data.upload_path);
        if (bytes.length > MAX_SOURCE_BYTES) throw new Error("Arquivo maior que 50MB.");
        if ((await sha256Hex(bytes)) !== data.hash) {
          throw new Error("O arquivo enviado não confere com o original. Tente enviar de novo.");
        }
      } else if (!existing) {
        throw new Error("Arquivo não encontrado. Envie de novo.");
      }

      const kind: SourceKind = existing?.kind === "pptx" || existing?.kind === "pdf" ? existing.kind : data.kind;
      let material;
      let sourceText = "";
      let pdfToStore: Uint8Array | null = null;

      if (bytes && kind === "pdf") {
        const fileUri = await uploadToGemini(bytes);
        const [m, t] = await Promise.all([
          generateStudyMaterialFromPdfUri(fileUri),
          transcribePdf(fileUri).catch((e) => {
            console.error("Transcrição falhou", e);
            return "";
          }),
        ]);
        material = m;
        sourceText = t;
        pdfToStore = bytes;
      } else if (bytes && kind === "pptx") {
        sourceText = await extractPptxText(bytes);
        material = await generateStudyMaterialFromText(sourceText);
        if (data.keep && !existing) {
          try {
            pdfToStore = await convertPptxToPdf(bytes);
          } catch (e) {
            console.error("Conversão falhou", e);
            warnings.push("Não foi possível converter o PPTX pra PDF — o tópico foi criado, mas sem a prévia do material.");
          }
        }
      } else if (existing) {
        // Cópia já guardada por alguém: reaproveita arquivo e texto, sem novo envio.
        sourceText = existing.text ?? "";
        if (kind === "pptx" && sourceText) {
          material = await generateStudyMaterialFromText(sourceText);
        } else {
          const fileUri = await uploadToGemini(await downloadObject(existing.storage_path));
          material = await generateStudyMaterialFromPdfUri(fileUri);
        }
      } else {
        throw new Error("Arquivo não encontrado. Envie de novo.");
      }

      let linkHash: string | null = null;
      if (data.keep) {
        if (existing) {
          linkHash = data.hash;
        } else if (pdfToStore) {
          try {
            await storeSourcePdf(data.hash, kind, pdfToStore, sourceText);
            linkHash = data.hash;
          } catch (e) {
            console.error("Falha ao guardar", e);
            warnings.push("Não foi possível guardar o arquivo original — o tópico foi criado sem a prévia.");
          }
        }
      }

      const topic_id = await saveGeneratedMaterial(context.supabase, material.topic_title, material);
      await setTopicSource(topic_id, {
        source_kind: kind,
        source_name: data.name,
        source_text: sourceText,
        source_hash: linkHash,
      });
      return { topic_id, warning: warnings.join(" ") || null };
    } finally {
      if (data.upload_path) await removeObjects([data.upload_path]).catch(() => undefined);
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