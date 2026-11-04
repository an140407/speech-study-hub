import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { askJson, PROFESSOR } from "./ai.server";
import { sanitizeStudyHtml as sanitize } from "./html-clean";
import { checkMnemonic, type Mnemonic } from "./mnemonics";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

/**
 * Ferramentas de IA do resumo: tabela comparativa sob demanda, explicar uma seção de
 * novo e mnemônicos. O HTML devolvido pela IA passa por uma lista de tags permitidas,
 * porque vai direto para o editor do resumo.
 */

async function grounding(supabase: Db, topicId: string) {
  const [{ data: topic }, { data: summary }] = await Promise.all([
    supabase.from("topics").select("title").eq("id", topicId).single(),
    supabase
      .from("materials")
      .select("content")
      .eq("topic_id", topicId)
      .eq("type", "summary")
      .maybeSingle(),
  ]);
  if (!topic) throw new Error("Tópico não encontrado.");
  const content = (summary?.content ?? {}) as { html?: string; text?: string };
  const text = String(content.html ?? content.text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 9000);
  return { title: String(topic.title), summaryText: text };
}

/** Itálico só onde a convenção pede; nomes de testes, protocolos e medicamentos ficam em texto normal. */
const EM_RULE =
  "Use <em> só para expressões em latim, nomes científicos ou um rótulo curto como 'Dica de prova:'. Nomes de testes, protocolos, escalas e medicamentos ficam sem itálico.";

export const compareTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ topic_id: z.string().uuid(), query: z.string().trim().min(3).max(200) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { title, summaryText } = await grounding(context.supabase, data.topic_id);
    const result = await askJson<{ title?: string; html?: string }>(
      `${PROFESSOR}
Monte uma TABELA COMPARATIVA de estudo para prova.
Regras:
- Colunas = os itens comparados; linhas = os critérios que realmente diferenciam (de 5 a 9), como definição, causas, mecanismo, características, avaliação, diagnóstico diferencial, conduta e terapia, prognóstico, conforme o caso.
- A primeira coluna é o critério. Células curtas (até 20 palavras), objetivas, só com conhecimento consolidado.
- Depois da tabela, um parágrafo de 1 a 2 frases com a dica que mais diferencia um do outro na prova.
- "html": só as tags table, thead, tbody, tr, th, td, p, strong, em. Sem markdown, sem asteriscos, sem estilos.
- ${EM_RULE}
- Revise a concordância e a ortografia antes de responder.
- "title": título curto, por exemplo "Perda condutiva × neurossensorial".
Responda SOMENTE com JSON: { "title": "string", "html": "string" }`,
      `Tema do tópico: "${title}".
O que comparar: ${data.query}
Trecho do resumo do tópico, para manter coerência: ${summaryText || "não disponível"}`,
    );
    const html = sanitize(String(result.html ?? ""));
    if (!html.includes("<table>"))
      throw new Error("A IA não devolveu uma tabela. Tente descrever a comparação de outro jeito.");
    return {
      title: String(result.title ?? data.query)
        .trim()
        .slice(0, 120),
      html,
    };
  });

const MODES = {
  simples:
    "MAIS SIMPLES: explique como para quem está vendo o assunto pela primeira vez, com frases curtas, uma analogia do dia a dia e sem perder a precisão.",
  fundo:
    "MAIS A FUNDO: aprofunde o mecanismo (celular, molecular ou fisiológico), passo a passo, ligando causa e consequência, no nível de uma boa prova de graduação.",
  clinico:
    "COM EXEMPLO CLÍNICO: mostre o conteúdo aplicado a um paciente (2 a 4 frases de situação) e explique como cada ponto da seção aparece nele.",
} as const;

export const reexplainSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        topic_id: z.string().uuid(),
        section_title: z.string().trim().min(1).max(200),
        section_text: z.string().trim().min(1).max(12000),
        mode: z.enum(["simples", "fundo", "clinico"]),
        focus: z.string().trim().max(160).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { title } = await grounding(context.supabase, data.topic_id);
    const focus = data.focus
      ? `Foco pedido pelo aluno: ${data.focus}. Concentre a explicação nisso.`
      : "Sem foco definido: explique o ponto central da seção, não um detalhe lateral.";
    const result = await askJson<{ title?: string; html?: string }>(
      `${PROFESSOR}
Explique de novo UMA seção do resumo do aluno, do jeito pedido: ${MODES[data.mode]}
Regras:
- De 120 a 260 palavras. Não repita a seção com outras palavras: traga a explicação que faltou.
- Use só conhecimento consolidado e coerente com o conteúdo da seção.
- "html": só as tags p, ul, ol, li, strong, em. Sem títulos, sem markdown, sem asteriscos.
- ${EM_RULE}
- "title": de 2 a 6 palavras dizendo do que trata a explicação, por exemplo "Mecanismo dos glicocorticoides".
Responda SOMENTE com JSON: { "title": "string", "html": "string" }`,
      `Tópico: "${title}".
Seção: "${data.section_title}"
${focus}
Conteúdo da seção: ${data.section_text}`,
    );
    const html = sanitize(String(result.html ?? "")).replace(/<\/?h3>/g, "");
    if (html.replace(/<[^>]+>/g, "").trim().length < 40)
      throw new Error("A IA não devolveu uma explicação válida. Tente de novo.");
    const label = String(result.title ?? "")
      .replace(/[<>*]/g, "")
      .trim()
      .slice(0, 80);
    return { html, title: label };
  });

export const generateMnemonics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ topic_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { title, summaryText } = await grounding(context.supabase, data.topic_id);
    const ask = (extra: string) =>
      askJson<{ mnemonics?: unknown[] }>(
        `${PROFESSOR}
Crie MNEMÔNICOS em português para as listas e classificações do tópico que mais caem em prova.
Regras:
- De 5 a 7 mnemônicos, cada um para uma lista real do conteúdo (sinais, causas, critérios, classificações, testes, etapas), com 3 a 7 itens.
- "itens": os itens da lista, na ordem do mnemônico. Nunca troque nem force um item para caber nas letras.
- "tipo":
  "frase" (o padrão): uma frase curta, visual ou engraçada, fácil de falar, em que cada palavra-chave começa com a mesma letra do item da mesma posição. Palavras de ligação (e, de, o, a, com) podem aparecer entre elas. Em "chaves", liste as palavras-chave exatamente como estão na frase, uma palavra por item.
  "sigla": só quando as iniciais dos itens, na ordem, formam uma palavra real ou fácil de ler em voz alta. Nunca entregue uma sigla impronunciável como "MRTQ"; nesse caso, faça uma frase.
  "outro": só para mnemônicos clássicos que não usam iniciais (por exemplo, uma regra numérica).
- Confira letra por letra: a primeira letra de cada item tem de ser igual à letra da sigla, ou à inicial da palavra-chave, na mesma posição.
- "classico": true só se o mnemônico for amplamente ensinado nos cursos de Fonoaudiologia do Brasil. Na dúvida, false. O que você acabou de criar nunca é clássico.
- "explicacao": 1 frase dizendo como usar ou quando lembrar.
- Texto puro, sem asteriscos.${extra}
Responda SOMENTE com JSON: { "mnemonics": [{ "lista": "string", "tipo": "frase", "mnemonico": "string", "chaves": ["string"], "itens": ["string"], "explicacao": "string", "classico": false }] }`,
        `Tópico: "${title}".
Resumo do tópico (base de conteúdo): ${summaryText || "não disponível"}`,
      );

    const valid: Mnemonic[] = [];
    const rejected: string[] = [];
    const take = (list: unknown[] | undefined) => {
      for (const raw of list ?? []) {
        const m = checkMnemonic(raw);
        const name = String((raw as { lista?: unknown })?.lista ?? "").trim();
        if (!m) {
          if (name)
            rejected.push(`${name} (${String((raw as { mnemonico?: unknown }).mnemonico ?? "")})`);
        } else if (!valid.some((v) => v.lista.toLowerCase() === m.lista.toLowerCase())) {
          valid.push(m);
        }
      }
    };

    take((await ask("")).mnemonics);
    // Se muitos vieram com letras erradas, pede de novo uma vez, dizendo o que falhou.
    if (valid.length < 3) {
      take(
        (
          await ask(
            `\n- Na tentativa anterior, estes foram descartados porque as letras não batiam com os itens: ${rejected.join("; ") || "nenhum válido"}. Refaça conferindo letra por letra.`,
          )
        ).mnemonics,
      );
    }

    const items = valid.slice(0, 6);
    if (!items.length) throw new Error("A IA não devolveu mnemônicos válidos. Tente de novo.");
    const { error } = await context.supabase.rpc("set_topic_material", {
      p_topic_id: data.topic_id,
      p_type: "mnemonics",
      p_content: { items, created_at: new Date().toISOString() },
    });
    if (error) throw new Error(error.message);
    return { items };
  });
