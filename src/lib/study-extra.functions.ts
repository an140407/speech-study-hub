import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { askJson, askText, PROFESSOR } from "./ai.server";
import type { GuidingQA } from "./study-types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

async function topicContext(supabase: Db, topicId: string) {
  const [{ data: topic }, { data: materials }] = await Promise.all([
    supabase.from("topics").select("title").eq("id", topicId).single(),
    supabase.from("materials").select("type, content").eq("topic_id", topicId),
  ]);
  if (!topic) throw new Error("Tópico não encontrado.");
  const mindmap = (materials ?? []).find((m: { type: string }) => m.type === "mindmap")?.content as
    | { branches?: { title?: string }[] }
    | undefined;
  const branches = (mindmap?.branches ?? []).map((b) => String(b.title ?? "")).filter(Boolean);
  return { title: String(topic.title), branches };
}

/* ---------------------------------- Flashcards ---------------------------------- */

export const generateMoreFlashcards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        topic_id: z.string().uuid(),
        count: z.number().int().min(1).max(30),
        subtopics: z.array(z.string()).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { title, branches } = await topicContext(context.supabase, data.topic_id);
    const { data: existing } = await context.supabase
      .from("flashcards")
      .select("front")
      .eq("topic_id", data.topic_id);
    const allowed = data.subtopics?.length ? data.subtopics : branches.length ? branches : ["Geral"];

    const result = await askJson<{ flashcards?: { front?: string; back?: string; subtopic?: string }[] }>(
      `${PROFESSOR}
Gere flashcards de estudo novos, objetivos e clinicamente relevantes.
Responda SOMENTE com JSON: { "flashcards": [{ "front": "pergunta curta", "back": "resposta completa e concisa", "subtopic": "string" }] }
O campo "subtopic" deve ser EXATAMENTE um dos sub-tópicos permitidos. Não repita flashcards já existentes.`,
      `Tema: "${title}".
Sub-tópicos permitidos: ${allowed.join(" | ")}.
Gere exatamente ${data.count} flashcards NOVOS.
Flashcards já existentes (não repita): ${(existing ?? []).map((f: { front: string }) => f.front).join(" // ") || "nenhum"}`,
    );

    const cards = (result.flashcards ?? [])
      .filter((f) => f?.front && f?.back)
      .slice(0, data.count)
      .map((f) => ({
        front: String(f.front),
        back: String(f.back),
        subtopic: allowed.includes(String(f.subtopic)) ? String(f.subtopic) : allowed[0]!,
      }));
    if (!cards.length) throw new Error("A IA não devolveu flashcards válidos.");

    const { data: inserted, error } = await context.supabase.rpc("add_flashcards", {
      p_topic_id: data.topic_id,
      p_flashcards: cards,
    });
    if (error) throw new Error(error.message);
    return { inserted: Number(inserted ?? 0) };
  });

/* ------------------------------------ MCQ --------------------------------------- */

export const generateMoreMcq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ topic_id: z.string().uuid(), count: z.number().int().min(1).max(20) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { title, branches } = await topicContext(context.supabase, data.topic_id);
    const { data: existing } = await context.supabase
      .from("mcq_questions")
      .select("question")
      .eq("topic_id", data.topic_id);
    const allowed = branches.length ? branches : ["Geral"];

    const result = await askJson<{
      mcq?: { question?: string; options?: string[]; correct_index?: number; explanation?: string; subtopic?: string }[];
    }>(
      `${PROFESSOR}
Gere questões de múltipla escolha novas, no estilo de prova de graduação.
Responda SOMENTE com JSON: { "mcq": [{ "question": "string", "options": ["a","b","c","d"], "correct_index": 0, "explanation": "string", "subtopic": "string" }] }
Cada questão tem EXATAMENTE 4 alternativas, correct_index entre 0 e 3, e "subtopic" igual a um dos sub-tópicos permitidos.`,
      `Tema: "${title}".
Sub-tópicos permitidos: ${allowed.join(" | ")}.
Gere exatamente ${data.count} questões NOVAS.
Questões já existentes (não repita): ${(existing ?? []).map((q: { question: string }) => q.question).join(" // ") || "nenhuma"}`,
    );

    const mcq = (result.mcq ?? [])
      .filter((q) => q?.question && Array.isArray(q.options) && q.options.length === 4)
      .slice(0, data.count)
      .map((q) => ({
        question: String(q.question),
        options: q.options!.map(String),
        correct_index: Math.min(3, Math.max(0, Number(q.correct_index) || 0)),
        explanation: String(q.explanation ?? ""),
        subtopic: allowed.includes(String(q.subtopic)) ? String(q.subtopic) : allowed[0]!,
      }));
    if (!mcq.length) throw new Error("A IA não devolveu questões válidas.");

    const { data: inserted, error } = await context.supabase.rpc("add_mcq_questions", {
      p_topic_id: data.topic_id,
      p_mcq: mcq,
    });
    if (error) throw new Error(error.message);
    return { inserted: Number(inserted ?? 0) };
  });

export const explainMcq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ mcq_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: q, error } = await context.supabase
      .from("mcq_questions")
      .select("question, options, correct_index, explanation")
      .eq("id", data.mcq_id)
      .single();
    if (error || !q) throw new Error("Questão não encontrada.");

    const letters = ["A", "B", "C", "D"];
    const text = await askText(
      `${PROFESSOR}
Explique a questão de forma aprofundada: por que a alternativa correta está certa, por que cada uma das outras está errada, e qual o conceito de base que o aluno precisa dominar. Use 150 a 300 palavras, em parágrafos curtos.`,
      `Questão: ${q.question}
${(q.options as string[]).map((o, i) => `${letters[i]}) ${o}`).join("\n")}
Alternativa correta: ${letters[q.correct_index as number]}
Explicação resumida já existente: ${q.explanation || "nenhuma"}`,
    );
    if (!text) throw new Error("A IA não devolveu uma explicação.");

    const { error: saveError } = await context.supabase.rpc("set_mcq_explanation", {
      p_mcq_id: data.mcq_id,
      p_ai_explanation: text,
    });
    if (saveError) throw new Error(saveError.message);
    return { ai_explanation: text };
  });

/* ------------------------------- Backfill subtopics ------------------------------ */

export const backfillSubtopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ topic_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { branches } = await topicContext(context.supabase, data.topic_id);
    if (!branches.length) return { updated: 0 };

    const [{ data: cards }, { data: questions }] = await Promise.all([
      context.supabase.from("flashcards").select("id, front").eq("topic_id", data.topic_id).is("subtopic", null),
      context.supabase.from("mcq_questions").select("id, question").eq("topic_id", data.topic_id).is("subtopic", null),
    ]);
    const items = [
      ...((cards ?? []) as { id: string; front: string }[]).map((c) => ({ kind: "f" as const, id: c.id, text: c.front })),
      ...((questions ?? []) as { id: string; question: string }[]).map((q) => ({ kind: "m" as const, id: q.id, text: q.question })),
    ];
    if (!items.length) return { updated: 0 };

    const result = await askJson<{ items?: { id?: string; subtopic?: string }[] }>(
      `${PROFESSOR}
Classifique cada item no sub-tópico mais próximo da lista fornecida.
Responda SOMENTE com JSON: { "items": [{ "id": "id recebido", "subtopic": "um dos sub-tópicos" }] }`,
      `Sub-tópicos: ${branches.join(" | ")}
Itens:
${items.map((i) => `${i.id} :: ${i.text}`).join("\n")}`,
    );

    let updated = 0;
    for (const r of result.items ?? []) {
      const item = items.find((i) => i.id === r.id);
      const subtopic = branches.includes(String(r.subtopic)) ? String(r.subtopic) : branches[0]!;
      if (!item) continue;
      const { error } = await (context.supabase as Db).rpc(
        item.kind === "f" ? "set_flashcard_subtopic" : "set_mcq_subtopic",
        item.kind === "f"
          ? { p_flashcard_id: item.id, p_subtopic: subtopic }
          : { p_mcq_id: item.id, p_subtopic: subtopic },
      );
      if (!error) updated++;
    }
    return { updated };
  });

/* --------------------------------- Caso clínico --------------------------------- */

export const generateClinicalCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ topic_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { title } = await topicContext(context.supabase, data.topic_id);
    const { data: existing } = await context.supabase
      .from("clinical_cases")
      .select("scenario")
      .eq("topic_id", data.topic_id);

    const result = await askJson<{
      scenario?: string;
      guiding_questions?: { question?: string; answer?: string }[];
      case_explanation?: string;
    }>(
      `${PROFESSOR}
Crie um caso clínico completo e realista.
Responda SOMENTE com JSON: { "scenario": "string (150 a 250 palavras)", "guiding_questions": [{ "question": "string", "answer": "string (resposta completa)" }], "case_explanation": "string (raciocínio clínico geral e conduta esperada, 100 a 200 palavras)" }
Use de 5 a 10 perguntas guiadas, cada uma com sua resposta.`,
      `Tema: "${title}".
Casos já existentes (crie um diferente destes): ${(existing ?? []).map((c: { scenario: string }) => c.scenario.slice(0, 160)).join(" // ") || "nenhum"}`,
    );

    const guiding = (result.guiding_questions ?? [])
      .filter((g) => g?.question)
      .map((g) => ({ question: String(g.question), answer: String(g.answer ?? ""), ai_explanation: null }));
    if (!result.scenario || !guiding.length) throw new Error("A IA não devolveu um caso válido.");

    const { data: caseId, error } = await context.supabase.rpc("add_clinical_case", {
      p_topic_id: data.topic_id,
      p_scenario: String(result.scenario),
      p_guiding_questions: guiding,
      p_case_explanation: String(result.case_explanation ?? ""),
    });
    if (error) throw new Error(error.message);
    return { case_id: caseId as string };
  });

async function loadCase(supabase: Db, caseId: string) {
  const { data, error } = await supabase
    .from("clinical_cases")
    .select("id, scenario, guiding_questions, case_explanation")
    .eq("id", caseId)
    .single();
  if (error || !data) throw new Error("Caso não encontrado.");
  return data as { id: string; scenario: string; guiding_questions: GuidingQA[]; case_explanation: string | null };
}

export const explainGuidingQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ case_id: z.string().uuid(), index: z.number().int().min(0).max(30) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const c = await loadCase(context.supabase, data.case_id);
    const q = c.guiding_questions[data.index];
    if (!q) throw new Error("Pergunta não encontrada.");

    const text = await askText(
      `${PROFESSOR}
Aprofunde a resposta da pergunta guiada do caso clínico: explique o raciocínio, cite achados do caso que sustentam a resposta e o que o aluno precisa saber. 150 a 300 palavras.`,
      `Cenário: ${c.scenario}

Pergunta: ${q.question}
Resposta de referência: ${q.answer || "não informada"}`,
    );
    if (!text) throw new Error("A IA não devolveu uma explicação.");

    const updated = c.guiding_questions.map((g, i) => (i === data.index ? { ...g, ai_explanation: text } : g));
    const { error } = await context.supabase.rpc("update_clinical_case_content", {
      p_case_id: data.case_id,
      p_guiding_questions: updated,
      p_case_explanation: c.case_explanation ?? "",
    });
    if (error) throw new Error(error.message);
    return { ai_explanation: text };
  });

/** Preenche respostas e explicação geral que estejam faltando num caso antigo. */
export const backfillClinicalCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ case_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const c = await loadCase(context.supabase, data.case_id);
    const missingAnswers = c.guiding_questions.some((g) => !g.answer?.trim());
    const missingExplanation = !c.case_explanation?.trim();
    if (!missingAnswers && !missingExplanation) return { filled: false };

    const result = await askJson<{ answers?: string[]; case_explanation?: string }>(
      `${PROFESSOR}
Responda às perguntas guiadas de um caso clínico e escreva a explicação geral do caso.
Responda SOMENTE com JSON: { "answers": ["resposta da pergunta 1", "..."], "case_explanation": "string (100 a 200 palavras)" }
O array "answers" deve ter exatamente o mesmo número de itens e a mesma ordem das perguntas.`,
      `Cenário: ${c.scenario}

Perguntas:
${c.guiding_questions.map((g, i) => `${i + 1}. ${g.question}`).join("\n")}`,
    );

    const answers = result.answers ?? [];
    const guiding = c.guiding_questions.map((g, i) => ({
      ...g,
      answer: g.answer?.trim() ? g.answer : String(answers[i] ?? ""),
    }));
    const explanation = c.case_explanation?.trim() || String(result.case_explanation ?? "");

    const { error } = await context.supabase.rpc("update_clinical_case_content", {
      p_case_id: data.case_id,
      p_guiding_questions: guiding,
      p_case_explanation: explanation,
    });
    if (error) throw new Error(error.message);
    return { filled: true };
  });
