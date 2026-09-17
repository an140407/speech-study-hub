import type { GeneratedMaterial } from "./study-types";

const SYSTEM_PROMPT = `Você é um professor universitário de Fonoaudiologia no Brasil. Gere material de estudo em português do Brasil, com rigor acadêmico e linguagem clara para estudantes de graduação.
Responda SOMENTE com um objeto JSON válido (sem markdown, sem texto fora do JSON) exatamente nesta estrutura:
{
  "summary": "string em markdown simples (use ## para seções, listas com -, **negrito**); 400 a 700 palavras",
  "mindmap": { "topic": "string", "branches": [{ "title": "string", "children": ["string"] }] },
  "flashcards": [{ "front": "string", "back": "string" }],
  "mcq": [{ "question": "string", "options": ["a","b","c","d"], "correct_index": 0, "explanation": "string" }],
  "clinical_case": { "scenario": "string", "guiding_questions": ["string"] },
  "review_questions": ["string"]
}
Regras: mindmap com 4 a 6 ramos e 3 a 5 filhos cada; flashcards de 8 a 12; mcq de 5 a 8 questões, cada uma com exatamente 4 alternativas e correct_index entre 0 e 3; clinical_case com 4 a 6 guiding_questions; review_questions de 5 a 8.`;

function extractJson(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("A IA não devolveu um JSON reconhecível.");
  return text.slice(start, end + 1);
}

function validate(data: unknown): GeneratedMaterial {
  const d = data as Partial<GeneratedMaterial>;
  if (!d || typeof d.summary !== "string") throw new Error("JSON sem 'summary'.");
  if (!d.mindmap || !Array.isArray(d.mindmap.branches)) throw new Error("JSON sem 'mindmap'.");
  if (!Array.isArray(d.flashcards) || d.flashcards.length === 0) throw new Error("JSON sem 'flashcards'.");
  if (!Array.isArray(d.mcq) || d.mcq.length === 0) throw new Error("JSON sem 'mcq'.");
  if (!d.clinical_case || typeof d.clinical_case.scenario !== "string") throw new Error("JSON sem 'clinical_case'.");
  if (!Array.isArray(d.review_questions)) throw new Error("JSON sem 'review_questions'.");
  const mcq = d.mcq
    .filter((q) => Array.isArray(q.options) && q.options.length === 4)
    .map((q) => ({
      question: String(q.question),
      options: q.options.map(String),
      correct_index: Math.min(3, Math.max(0, Number(q.correct_index) || 0)),
      explanation: String(q.explanation ?? ""),
    }));
  return {
    summary: d.summary,
    mindmap: {
      topic: String(d.mindmap.topic ?? ""),
      branches: d.mindmap.branches.map((b) => ({
        title: String(b.title),
        children: Array.isArray(b.children) ? b.children.map(String) : [],
      })),
    },
    flashcards: d.flashcards.map((f) => ({ front: String(f.front), back: String(f.back) })),
    mcq,
    clinical_case: {
      scenario: d.clinical_case.scenario,
      guiding_questions: Array.isArray(d.clinical_case.guiding_questions)
        ? d.clinical_case.guiding_questions.map(String)
        : [],
    },
    review_questions: d.review_questions.map(String),
  };
}

/** Calls Gemini directly when GEMINI_API_KEY is configured; otherwise uses Lovable AI (same model, no key needed). */
async function callModel(topic: string): Promise<string> {
  const userPrompt = `Tema de Fonoaudiologia: "${topic}"`;
  const geminiKey = process.env["GEMINI_API_KEY"];

  if (geminiKey) {
    const model = "gemini-3.1-flash-lite";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      console.error("Gemini error", res.status, body);
      throw new Error(`Erro na API do Gemini (${res.status}).`);
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  }

  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) throw new Error("Nenhuma chave de IA configurada (GEMINI_API_KEY ou LOVABLE_API_KEY).");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": lovableKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-lite",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt + " — responda em JSON." },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("Lovable AI error", res.status, body);
    if (res.status === 429) throw new Error("Muitas solicitações. Aguarde um instante e tente de novo.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
    throw new Error(`Erro na IA (${res.status}).`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

export async function generateStudyMaterial(topic: string): Promise<GeneratedMaterial> {
  const raw = await callModel(topic);
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch (e) {
    console.error("JSON parse failed", e, raw.slice(0, 500));
    throw new Error("A IA devolveu um formato inesperado. Tente novamente.");
  }
  return validate(parsed);
}
