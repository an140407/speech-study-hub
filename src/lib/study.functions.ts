import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateStudyMaterial, generateStudyMaterialFromPdf, generateStudyMaterialFromText } from "./gemini.server";
import { extractPptxText } from "./pptx.server";
import type { GeneratedMaterial } from "./study-types";
import type { Database } from "@/integrations/supabase/types";

async function saveMaterial(supabase: SupabaseClient<Database>, topicTitle: string, material: GeneratedMaterial) {
  const { data: topic_id, error } = await supabase.rpc("save_generated_material", {
    p_topic: topicTitle,
    p_summary: material.summary,
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

export const generateMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ topic: z.string().trim().min(3).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const material = await generateStudyMaterial(data.topic);
    const topic_id = await saveMaterial(context.supabase, data.topic, material);
    return { topic_id, material };
  });

export const generateMaterialFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ pdf_base64: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const material = await generateStudyMaterialFromPdf(data.pdf_base64);
    const topic_id = await saveMaterial(context.supabase, material.topic_title, material);
    return { topic_id, material };
  });

export const generateMaterialFromPptx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ pptx_base64: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const text = await extractPptxText(data.pptx_base64);
    const material = await generateStudyMaterialFromText(text);
    const topic_id = await saveMaterial(context.supabase, material.topic_title, material);
    return { topic_id, material };
  });