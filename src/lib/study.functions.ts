import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateStudyMaterial, generateStudyMaterialFromPdf } from "./gemini.server";

export const generateMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ topic: z.string().trim().min(3).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const material = await generateStudyMaterial(data.topic);

    const { data: topic_id, error } = await context.supabase.rpc("save_generated_material", {
      p_topic: data.topic,
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

    return { topic_id, material };
  });

export const generateMaterialFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ pdf_base64: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const material = await generateStudyMaterialFromPdf(data.pdf_base64);

    const { data: topic_id, error } = await context.supabase.rpc("save_generated_material", {
      p_topic: material.topic_title,
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

    return { topic_id, material };
  });