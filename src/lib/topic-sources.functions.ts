import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { askJson, PROFESSOR } from "./ai.server";
import { MCQ_RULES } from "./ai-config";
import { delatex } from "./delatex";
import { sanitizeStudyHtml } from "./html-clean";
import { transcribePdf } from "./source.server";

/**
 * Várias fontes por tópico: guardar o texto de uma fonte nova (PDF, PPTX ou texto colado)
 * e "atualizar o tópico" com ela, acrescentando só o que é novo ao resumo, sem reescrevê-lo.
 */

const FILE_URI_RE =
  /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/files\/[A-Za-z0-9_-]+$/;
const MAX_SOURCE_CHARS = 300_000;

/** Guarda a fonte nova (PDF é transcrito aqui; PPTX e texto já chegam como texto). */
export const addTopicSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        topic_id: z.string().uuid(),
        kind: z.enum(["pdf", "pptx", "texto"]),
        name: z.string().trim().min(1).max(200),
        text: z.string().max(MAX_SOURCE_CHARS).nullable(),
        file_uri: z.string().regex(FILE_URI_RE).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: topic } = await supabase
      .from("topics")
      .select("id")
      .eq("id", data.topic_id)
      .maybeSingle();
    if (!topic) throw new Error("Tópico não encontrado.");

    let text = data.text?.trim() ?? "";
    if (data.kind === "pdf") {
      if (!data.file_uri) throw new Error("O PDF não chegou à IA. Tente enviar de novo.");
      text = await transcribePdf(data.file_uri);
    }
    if (text.length < 80) {
      throw new Error("Não deu para ler conteúdo suficiente dessa fonte (ela parece vazia).");
    }

    const { data: last } = await supabase
      .from("topic_sources")
      .select("position")
      .eq("topic_id", data.topic_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: row, error } = await supabase
      .from("topic_sources")
      .insert({
        topic_id: data.topic_id,
        kind: data.kind,
        name: data.name,
        text: text.slice(0, MAX_SOURCE_CHARS),
        position: Math.max(1, (last?.position ?? 0) + 1),
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Não deu para guardar a fonte.");
    return { id: row.id as string, chars: text.length };
  });

/* ----------------------------- Atualizar o tópico ----------------------------- */

const strip = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Seções do resumo (pelos <h2>), com o texto inteiro de cada uma para a IA comparar. */
function summarySections(html: string) {
  return html
    .split(/<h2[^>]*>/i)
    .slice(1)
    .map((part, index) => {
      const [titleHtml = "", ...rest] = part.split(/<\/h2>/i);
      return { index, title: strip(titleHtml), text: strip(rest.join(" ")) };
    });
}

export type UpdateAddition = { section: number; title: string; html: string };
export type UpdateSection = { title: string; html: string };
export type UpdateCard = { front: string; back: string; subtopic: string };
export type UpdateQuestion = {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  subtopic: string;
};
export type UpdatePlan = {
  summary: string;
  additions: UpdateAddition[];
  sections: UpdateSection[];
  flashcards: UpdateCard[];
  questions: UpdateQuestion[];
};

/** A IA compara a fonte nova com o resumo e devolve só os acréscimos (nada é salvo aqui). */
export const planTopicUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ topic_id: z.string().uuid(), source_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<UpdatePlan> => {
    const supabase = context.supabase;
    const [{ data: topic }, { data: source }, { data: materials }] = await Promise.all([
      supabase.from("topics").select("title").eq("id", data.topic_id).maybeSingle(),
      supabase
        .from("topic_sources")
        .select("name, text")
        .eq("id", data.source_id)
        .eq("topic_id", data.topic_id)
        .maybeSingle(),
      supabase
        .from("materials")
        .select("type, content")
        .eq("topic_id", data.topic_id)
        .in("type", ["summary", "mindmap"]),
    ]);
    // O que já existe para praticar, para a IA não repetir
    const [{ data: cards }, { data: mcq }] = await Promise.all([
      supabase.from("flashcards").select("front").eq("topic_id", data.topic_id).limit(80),
      supabase.from("mcq_questions").select("question").eq("topic_id", data.topic_id).limit(60),
    ]);
    const existingPractice = [
      ...(cards ?? []).map((c) => `- ${strip(String(c.front)).slice(0, 160)}`),
      ...(mcq ?? []).map(
        (q) => `- ${strip(String(q.question).split("\n\n").pop() ?? "").slice(0, 160)}`,
      ),
    ].join("\n");
    if (!topic) throw new Error("Tópico não encontrado.");
    if (!source?.text?.trim()) throw new Error("Essa fonte não tem texto guardado.");

    const byType = new Map((materials ?? []).map((m) => [m.type, m.content]));
    const summaryHtml = String(
      (byType.get("summary") as { html?: string } | undefined)?.html ?? "",
    );
    const sections = summarySections(summaryHtml);
    const branches = (
      ((byType.get("mindmap") as { branches?: { title?: string }[] } | undefined)?.branches ??
        []) as { title?: string }[]
    )
      .map((b) => String(b.title ?? "").trim())
      .filter(Boolean);
    const fallbackBranch = branches[0] ?? "Geral";
    const branchOf = (s: unknown) =>
      typeof s === "string" && branches.includes(s.trim()) ? s.trim() : fallbackBranch;

    const raw = await askJson<{
      novidades?: string;
      acrescimos?: { secao?: number; html?: string }[];
      secoes_novas?: { titulo?: string; html?: string }[];
      flashcards?: { front?: string; back?: string; subtopic?: string }[];
      questoes?: {
        question?: string;
        options?: string[];
        correct_index?: number;
        explanation?: string;
        subtopic?: string;
      }[];
    }>(
      `${PROFESSOR}
O aluno já tem um resumo deste tópico e trouxe uma FONTE NOVA (outra aula, artigo ou anotação). ATUALIZE o tópico sem reescrever o resumo: aponte só o que a fonte nova acrescenta.
Regras:
- Leia o RESUMO ATUAL INTEIRO abaixo antes de propor qualquer coisa. Se um conceito já aparece em qualquer parte do resumo, mesmo com outras palavras ou em outra seção, NÃO o proponha. Na dúvida, não proponha. É melhor devolver pouco do que repetir.
- "acrescimos": para cada seção que ganha conteúdo, { "secao": número da seção, "html": o trecho novo, completo e bem escrito }. Escolha a seção pelo assunto (causas e mecanismos vão para fisiopatologia e etiologia; sinais e sintomas, para manifestações clínicas; testes, protocolos e exames, para avaliação fonoaudiológica; técnicas, orientações e encaminhamentos, para conduta e terapia). Tags: p, ul, ol, li, strong, em, table, thead, tbody, tr, th, td (a primeira linha da tabela usa th). Sem títulos.
- "secoes_novas": só se a fonte trouxer um assunto que não cabe em nenhuma seção: { "titulo", "html" }.
- Se a fonte disser algo que contradiz o resumo ou a literatura consolidada (tratados da Fonoaudiologia e consensos da área), julgue quem está certo pela literatura e inclua o ponto em "acrescimos", começando com "<p><strong>Atenção:</strong>". Se a FONTE estiver errada, diga isso claramente ("a fonte afirma X, mas o correto é Y, porque…"); não tente conciliar as duas versões nem tratar o erro como variação aceitável. Se o resumo estiver errado, diga isso.
- "novidades": 1 ou 2 frases dizendo o que a fonte acrescenta de mais importante, ou que ela quase não acrescenta nada.
- "flashcards": de 0 a 6, só sobre o conteúdo novo e sem repetir os que já existem (lista abaixo). "questoes": de 0 a 4, só sobre o conteúdo novo e sem repetir as existentes, cada uma com "options" (4), "correct_index" (0 a 3) e "explanation".
- "subtopic" de flashcards e questões: um destes ramos, exatamente igual: ${branches.length ? branches.map((b) => `"${b}"`).join(", ") : '"Geral"'}.
- Se a fonte não acrescentar nada, devolva as listas vazias.
- Use o conteúdo da fonte e conhecimento consolidado. Sem markdown e sem asteriscos.

${MCQ_RULES}

Responda SOMENTE com JSON: { "novidades": "string", "acrescimos": [{ "secao": 0, "html": "string" }], "secoes_novas": [{ "titulo": "string", "html": "string" }], "flashcards": [{ "front": "string", "back": "string", "subtopic": "string" }], "questoes": [{ "question": "string", "options": ["a","b","c","d"], "correct_index": 0, "explanation": "string", "subtopic": "string" }] }`,
      `Tópico: "${String(topic.title)}".

RESUMO ATUAL, INTEIRO (seções numeradas a partir de 0):
${
  sections
    .map((s) => `[${s.index}] ${s.title}\n${s.text}`)
    .join("\n\n")
    .slice(0, 120_000) || "(resumo vazio)"
}

FLASHCARDS E QUESTÕES QUE JÁ EXISTEM:
${existingPractice || "(nenhum)"}

FONTE NOVA ("${String(source.name ?? "fonte")}"):
${String(source.text).slice(0, 60_000)}`,
    );

    const additions = (raw.acrescimos ?? [])
      .map((a) => ({
        section: Number(a?.secao),
        title: sections[Number(a?.secao)]?.title ?? "",
        html: delatex(sanitizeStudyHtml(String(a?.html ?? "")), "html").replace(/<\/?h3>/g, ""),
      }))
      .filter(
        (a) =>
          Number.isInteger(a.section) &&
          a.section >= 0 &&
          a.section < sections.length &&
          strip(a.html).length > 20,
      )
      .slice(0, 14);
    const newSections = (raw.secoes_novas ?? [])
      .map((s) => ({
        title: strip(String(s?.titulo ?? "")).slice(0, 120),
        html: delatex(sanitizeStudyHtml(String(s?.html ?? "")), "html"),
      }))
      .filter((s) => s.title && strip(s.html).length > 20)
      .slice(0, 3);
    const flashcards = (raw.flashcards ?? [])
      .map((f) => ({
        front: delatex(String(f?.front ?? "").trim()),
        back: delatex(String(f?.back ?? "").trim()),
        subtopic: branchOf(f?.subtopic),
      }))
      .filter((f) => f.front && f.back)
      .slice(0, 6);
    const questions = (raw.questoes ?? [])
      .filter((q) => Array.isArray(q?.options) && q.options.length === 4 && q.question)
      .map((q) => ({
        question: delatex(String(q.question).trim()),
        options: q.options!.map((o) => delatex(String(o).trim())),
        correct_index: Math.min(3, Math.max(0, Math.round(Number(q.correct_index) || 0))),
        explanation: delatex(String(q.explanation ?? "").trim()),
        subtopic: branchOf(q.subtopic),
      }))
      .slice(0, 4);

    return {
      summary: strip(String(raw.novidades ?? "")).slice(0, 500),
      additions,
      sections: newSections,
      flashcards,
      questions,
    };
  });

/** Salva os flashcards e questões escolhidos e marca a fonte como incluída. */
export const applyTopicUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        topic_id: z.string().uuid(),
        source_id: z.string().uuid(),
        flashcards: z
          .array(
            z.object({
              front: z.string().trim().min(1).max(2000),
              back: z.string().trim().min(1).max(4000),
              subtopic: z.string().max(200),
            }),
          )
          .max(10),
        questions: z
          .array(
            z.object({
              question: z.string().trim().min(1).max(4000),
              options: z.array(z.string().max(1000)).length(4),
              correct_index: z.number().int().min(0).max(3),
              explanation: z.string().max(4000),
              subtopic: z.string().max(200),
            }),
          )
          .max(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: source } = await supabase
      .from("topic_sources")
      .select("id")
      .eq("id", data.source_id)
      .eq("topic_id", data.topic_id)
      .maybeSingle();
    if (!source) throw new Error("Fonte não encontrada.");

    if (data.flashcards.length) {
      const { error } = await supabase
        .from("flashcards")
        .insert(data.flashcards.map((f) => ({ ...f, topic_id: data.topic_id })));
      if (error) throw new Error(`Não deu para salvar os flashcards (${error.message}).`);
    }
    if (data.questions.length) {
      const { error } = await supabase
        .from("mcq_questions")
        .insert(data.questions.map((q) => ({ ...q, topic_id: data.topic_id })));
      if (error) throw new Error(`Não deu para salvar as questões (${error.message}).`);
    }
    await supabase
      .from("topic_sources")
      .update({ merged_at: new Date().toISOString() })
      .eq("id", data.source_id);
    return { ok: true };
  });
