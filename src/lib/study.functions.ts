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

    const { data: topic, error: tErr } = await db
      .from("topics")
      .insert({ title: data.topic })
      .select("id")
      .single();
    if (tErr || !topic) throw new Error("Não foi possível salvar o tópico.");

    const topic_id = topic.id;
    const [m, f, q] = await Promise.all([
      db.from("materials").insert([
        { topic_id, type: "summary", content: { text: material.summary } },
        { topic_id, type: "mindmap", content: material.mindmap },
        { topic_id, type: "clinical_case", content: material.clinical_case },
        { topic_id, type: "review_questions", content: { items: material.review_questions } },
      ]),
      db.from("flashcards").insert(material.flashcards.map((c) => ({ topic_id, ...c }))),
      db.from("mcq_questions").insert(material.mcq.map((c) => ({ topic_id, ...c }))),
    ]);
    const err = m.error ?? f.error ?? q.error;
    if (err) {
      console.error(err);
      throw new Error("Não foi possível salvar o material.");
    }

    return { topic_id, material };
  });
