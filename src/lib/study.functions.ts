import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { generateStudyMaterial } from "./gemini.server";

function authedClient(accessToken: string) {
  return createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export const generateMaterial = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        topic: z.string().trim().min(3).max(120),
        accessToken: z.string().min(1, "Sessão expirada. Faça login novamente."),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const material = await generateStudyMaterial(data.topic);
    const db = authedClient(data.accessToken);

    const { data: topic_id, error } = await db.rpc("save_generated_material", {
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