import type { GeneratedMaterial } from "./study-types";
import { base64ToUint8Array } from "./base64.server";

const SYSTEM_PROMPT = `Você é um professor universitário de Fonoaudiologia no Brasil. Gere material de estudo em português do Brasil, com rigor acadêmico e linguagem clara para estudantes de graduação.
Responda SOMENTE com um objeto JSON válido (sem markdown, sem texto fora do JSON) exatamente nesta estrutura:
{
  "summary": "string em markdown simples (use ## para seções, listas com -, **negrito**); 400 a 700 palavras",
  "mindmap": { "topic": "string", "branches": [{ "title": "string", "children": ["string"] }] },
  "flashcards": [{ "front": "string", "back": "string", "subtopic": "string (deve ser igual ao title de um dos branches do mindmap)" }],
  "mcq": [{ "question": "string", "options": ["a","b","c","d"], "correct_index": 0, "explanation": "string", "subtopic": "string (igual ao title de um dos branches do mindmap)" }],
  "clinical_case": {
    "scenario": "string",
    "guiding_questions": [{ "question": "string", "answer": "string (resposta completa e correta da pergunta guiada)" }],
    "case_explanation": "string (explicação geral de todo o caso: raciocínio clínico, o que o quadro sugere, e conduta esperada; 100 a 200 palavras)"
  },
  "review_questions": ["string"]
}
Regras: mindmap com 4 a 6 ramos e 3 a 5 filhos cada; todo flashcard e toda questão de mcq precisa ter "subtopic" igual ao título de um branch existente do mindmap (nunca invente um subtopic fora da lista de branches); flashcards de 8 a 12; mcq com EXATAMENTE 10 questões, cada uma com exatamente 4 alternativas e correct_index entre 0 e 3; clinical_case com 5 a 10 guiding_questions, cada uma já com sua resposta; review_questions de 5 a 8.`;

const SYSTEM_PROMPT_PDF = `Você é um professor universitário de Fonoaudiologia no Brasil. Vai receber um PDF de aula, slide ou material de estudo. Primeiro identifique o tema central e específico coberto no PDF (um título curto, no mesmo estilo de "Disfagia orofaríngea" ou "Paralisia facial periférica" — nunca genérico como "Fonoaudiologia" ou "Aula 3"). Depois gere material de estudo em português do Brasil, com rigor acadêmico, baseado no CONTEÚDO REAL do PDF (não invente fatos que não estejam nele ou que não sejam de conhecimento consolidado da área).
Responda SOMENTE com um objeto JSON válido (sem markdown, sem texto fora do JSON) exatamente nesta estrutura:
{
  "topic_title": "string (o título curto e específico que você identificou)",
  "summary": "string em markdown simples (use ## para seções, listas com -, **negrito**); 400 a 700 palavras",
  "mindmap": { "topic": "string", "branches": [{ "title": "string", "children": ["string"] }] },
  "flashcards": [{ "front": "string", "back": "string", "subtopic": "string (deve ser igual ao title de um dos branches do mindmap)" }],
  "mcq": [{ "question": "string", "options": ["a","b","c","d"], "correct_index": 0, "explanation": "string", "subtopic": "string (igual ao title de um dos branches do mindmap)" }],
  "clinical_case": {
    "scenario": "string",
    "guiding_questions": [{ "question": "string", "answer": "string (resposta completa e correta da pergunta guiada)" }],
    "case_explanation": "string (explicação geral de todo o caso; 100 a 200 palavras)"
  },
  "review_questions": ["string"]
}
Regras: mesmas do material padrão — mindmap com 4 a 6 ramos e 3 a 5 filhos; flashcards e mcq sempre com "subtopic" igual a um branch existente; flashcards de 8 a 12; mcq com EXATAMENTE 10 questões (4 alternativas cada); clinical_case com 5 a 10 guiding_questions já respondidas; review_questions de 5 a 8. Se o arquivo cobrir mais de um tema (ex.: um cronograma de semestre com várias aulas), IGNORE conteúdo administrativo (ementa, critérios de avaliação, cronograma, capa) e escolha só o primeiro assunto técnico/clínico substancial — gere material completo só sobre ele, não sobre o curso inteiro.`;

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

  const branchTitles = d.mindmap.branches.map((b) => String(b.title));
  const fallbackSubtopic = branchTitles[0] ?? "Geral";
  const normalizeSubtopic = (s: unknown) =>
    typeof s === "string" && branchTitles.includes(s) ? s : fallbackSubtopic;

  const mcq = d.mcq
    .filter((q) => Array.isArray(q.options) && q.options.length === 4)
    .map((q) => ({
      question: String(q.question),
      options: q.options.map(String),
      correct_index: Math.min(3, Math.max(0, Number(q.correct_index) || 0)),
      explanation: String(q.explanation ?? ""),
      subtopic: normalizeSubtopic((q as { subtopic?: unknown }).subtopic),
    }));

  const guidingQuestionsRaw = d.clinical_case.guiding_questions as unknown;
  const guiding_questions = Array.isArray(guidingQuestionsRaw)
    ? guidingQuestionsRaw.map((g) => {
        if (typeof g === "string") return { question: g, answer: "" };
        const go = g as { question?: unknown; answer?: unknown };
        return { question: String(go.question ?? ""), answer: String(go.answer ?? "") };
      })
    : [];

  return {
    summary: d.summary,
    mindmap: {
      topic: String(d.mindmap.topic ?? ""),
      branches: d.mindmap.branches.map((b) => ({
        title: String(b.title),
        children: Array.isArray(b.children) ? b.children.map(String) : [],
      })),
    },
    flashcards: d.flashcards.map((f) => ({
      front: String(f.front),
      back: String(f.back),
      subtopic: normalizeSubtopic((f as { subtopic?: unknown }).subtopic),
    })),
    mcq,
    clinical_case: {
      scenario: d.clinical_case.scenario,
      guiding_questions,
      case_explanation: String((d.clinical_case as { case_explanation?: unknown }).case_explanation ?? ""),
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
          // 32000 é o mesmo valor que o MedReview usa — o padrão da API (sem isso)
          // já cortou material grande no passado (ver histórico do MedReview).
          generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 50000 },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      console.error("Gemini error", res.status, body);
      throw new Error(`Erro na API do Gemini (${res.status}).`);
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    };
    if (json.candidates?.[0]?.finishReason === "MAX_TOKENS") {
      throw new Error("A resposta da IA foi cortada por ficar grande demais. Tente de novo.");
    }
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
      response_format: { type: "json_schema", json_schema: { name: "study_material", strict: true, schema: JSON_SCHEMA } },
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

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "mindmap", "flashcards", "mcq", "clinical_case", "review_questions"],
  properties: {
    summary: { type: "string" },
    mindmap: {
      type: "object",
      additionalProperties: false,
      required: ["topic", "branches"],
      properties: {
        topic: { type: "string" },
        branches: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "children"],
            properties: { title: { type: "string" }, children: { type: "array", items: { type: "string" } } },
          },
        },
      },
    },
    flashcards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["front", "back", "subtopic"],
        properties: { front: { type: "string" }, back: { type: "string" }, subtopic: { type: "string" } },
      },
    },
    mcq: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "options", "correct_index", "explanation", "subtopic"],
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correct_index: { type: "integer" },
          explanation: { type: "string" },
          subtopic: { type: "string" },
        },
      },
    },
    clinical_case: {
      type: "object",
      additionalProperties: false,
      required: ["scenario", "guiding_questions", "case_explanation"],
      properties: {
        scenario: { type: "string" },
        guiding_questions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["question", "answer"],
            properties: { question: { type: "string" }, answer: { type: "string" } },
          },
        },
        case_explanation: { type: "string" },
      },
    },
    review_questions: { type: "array", items: { type: "string" } },
  },
};

export async function generateStudyMaterial(topic: string): Promise<GeneratedMaterial> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callModel(topic);
    try {
      return validate(JSON.parse(extractJson(raw)));
    } catch (e) {
      lastError = e;
      console.error(`Parse/validate failed (attempt ${attempt + 1})`, e, raw.slice(0, 300));
    }
  }
  console.error(lastError);
  throw new Error("A IA devolveu um formato inesperado. Tente novamente.");
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { file_data: { mime_type: string; file_uri: string } };

/** Envia um PDF pra File API do Gemini (upload resumível em duas etapas) e devolve o
 *  file_uri pra referenciar na geração. Suporta até 50MB — bem mais que o limite de
 *  ~20MB de mandar o arquivo embutido direto na chamada (inlineData). */
async function uploadPdfToGeminiFiles(pdfBase64: string, apiKey: string): Promise<string> {
  const bytes = base64ToUint8Array(pdfBase64);
  const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": "application/pdf",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "resumo.pdf" } }),
  });
  if (!startRes.ok) {
    console.error("Gemini upload start error", startRes.status, await startRes.text());
    throw new Error(`Falha ao iniciar o envio do PDF pro Gemini (${startRes.status}).`);
  }
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("O Gemini não devolveu a URL de upload.");

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes as BodyInit,
  });
  if (!uploadRes.ok) {
    console.error("Gemini upload finalize error", uploadRes.status, await uploadRes.text());
    throw new Error(`Falha ao enviar o PDF pro Gemini (${uploadRes.status}).`);
  }
  const info = (await uploadRes.json()) as { file?: { uri?: string } };
  if (!info.file?.uri) throw new Error("O Gemini não devolveu o arquivo enviado.");
  return info.file.uri;
}

/** Núcleo compartilhado: manda as partes (texto e/ou documento) pro Gemini, valida e devolve
 *  o material + o título identificado. Usado tanto pra PDF (file_data) quanto pra texto puro
 *  (PPTX já extraído, ou qualquer fonte futura). */
async function generateFromParts(userParts: GeminiPart[], sourceLabel: string): Promise<GeneratedMaterial & { topic_title: string }> {
  const geminiKey = process.env["GEMINI_API_KEY"];
  if (!geminiKey) {
    throw new Error(`Gerar a partir de ${sourceLabel} exige a chave própria do Gemini (GEMINI_API_KEY) configurada nos Secrets.`);
  }
  const model = "gemini-3.1-flash-lite";
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT_PDF }] },
        contents: [{ role: "user", parts: userParts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.6, maxOutputTokens: 50000 },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Gemini ${sourceLabel} error`, res.status, body);
      lastError = new Error(`Erro na API do Gemini (${res.status}).`);
      continue;
    }
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
    if (json.candidates?.[0]?.finishReason === "MAX_TOKENS") {
      lastError = new Error("A resposta da IA foi cortada por ficar grande demais.");
      continue;
    }
    const raw = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    try {
      const parsed = JSON.parse(extractJson(raw)) as Record<string, unknown>;
      const topic_title = String(parsed["topic_title"] ?? "").trim() || `Tema do ${sourceLabel}`;
      const material = validate(parsed);
      return { ...material, topic_title };
    } catch (e) {
      lastError = e;
      console.error(`${sourceLabel} parse/validate failed (attempt ${attempt + 1})`, e, raw.slice(0, 300));
    }
  }
  console.error(lastError);
  throw new Error(`A IA não conseguiu processar esse ${sourceLabel}. Tente outro arquivo ou um tema digitado.`);
}

/** Gera material a partir de um PDF (aula/slide) — o Gemini lê o documento visualmente.
 *  O PDF é enviado primeiro pela File API (suporta até 50MB) e só a referência é usada
 *  na geração. Só funciona com GEMINI_API_KEY própria — o gateway do Lovable não tem
 *  formato confirmado pra anexar documentos. */
export async function generateStudyMaterialFromPdf(pdfBase64: string) {
  const geminiKey = process.env["GEMINI_API_KEY"];
  if (!geminiKey) {
    throw new Error("Gerar a partir de PDF exige a chave própria do Gemini (GEMINI_API_KEY) configurada nos Secrets.");
  }
  const fileUri = await uploadPdfToGeminiFiles(pdfBase64, geminiKey);
  return generateFromParts(
    [
      { text: "Gere o material de estudo com base neste PDF de aula de Fonoaudiologia." },
      { file_data: { mime_type: "application/pdf", file_uri: fileUri } },
    ],
    "PDF",
  );
}

/** Gera material a partir de texto já extraído (ex.: PPTX, cujo conteúdo o Gemini não lê
 *  como documento nativo — só o texto das caixas dos slides chega até aqui). */
export async function generateStudyMaterialFromText(extractedText: string) {
  return generateFromParts(
    [
      {
        text:
          "Gere o material de estudo com base neste texto extraído de uma apresentação de slides " +
          `de Fonoaudiologia (só o texto das caixas foi extraído — imagens e diagramas não estão aqui):\n\n${extractedText}`,
      },
    ],
    "PPTX",
  );
}