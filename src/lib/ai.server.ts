/**
 * Pequeno utilitário de IA reaproveitando o mesmo padrão de gemini.server.ts:
 * usa a API do Gemini direto quando GEMINI_API_KEY existe, senão o gateway do Lovable.
 */

function extractJson(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("A IA não devolveu um JSON reconhecível.");
  return text.slice(start, end + 1);
}

async function callModel(system: string, user: string): Promise<string> {
  const geminiKey = process.env["GEMINI_API_KEY"];
  if (geminiKey) {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.8 },
        }),
      },
    );
    if (!res.ok) {
      console.error("Gemini error", res.status, await res.text());
      throw new Error(`Erro na API do Gemini (${res.status}).`);
    }
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  }

  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) throw new Error("Nenhuma chave de IA configurada.");
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
        { role: "system", content: system },
        { role: "user", content: `${user}\n\nResponda SOMENTE com JSON válido.` },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    console.error("Lovable AI error", res.status, await res.text());
    if (res.status === 429) throw new Error("Muitas solicitações. Aguarde um instante e tente de novo.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
    throw new Error(`Erro na IA (${res.status}).`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

/** Chama a IA e devolve o JSON já parseado (2 tentativas, como no gerador principal). */
export async function askJson<T>(system: string, user: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callModel(system, user);
    try {
      return JSON.parse(extractJson(raw)) as T;
    } catch (e) {
      lastError = e;
      console.error(`askJson parse failed (attempt ${attempt + 1})`, e, raw.slice(0, 300));
    }
  }
  console.error(lastError);
  throw new Error("A IA devolveu um formato inesperado. Tente novamente.");
}

/** Chama a IA esperando texto corrido (embrulhado em JSON para consistência). */
export async function askText(system: string, user: string): Promise<string> {
  const out = await askJson<{ text?: string }>(
    `${system}\nResponda no formato JSON: { "text": "sua resposta" }`,
    user,
  );
  return String(out.text ?? "").trim();
}

export const PROFESSOR = `Você é um professor universitário de Fonoaudiologia no Brasil. Escreva em português do Brasil, com rigor acadêmico e linguagem clara para estudantes de graduação.`;
