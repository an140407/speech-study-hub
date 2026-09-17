import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { generateStudyMaterial } from "./gemini.server";

function serverPublicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const generateMaterial = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ topic: z.string().trim().min(3).max(120) }).parse(input))
  .handler(async ({ data }) => {
    const material = await generateStudyMaterial(data.topic);
    const db = serverPublicClient();

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
      throw new Error("Não foi possível salvar o material.");
    }

    return { topic_id, material };
  });