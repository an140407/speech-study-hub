import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateStudyMaterial } from "./gemini.server";
import { saveGeneratedMaterial } from "./source.server";

/** Tema digitado. Arquivos (PDF/PPTX) usam o fluxo de source.functions.ts. */
export const generateMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ topic: z.string().trim().min(3).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const material = await generateStudyMaterial(data.topic);
    const topic_id = await saveGeneratedMaterial(context.supabase, data.topic, material);
    return { topic_id };
  });