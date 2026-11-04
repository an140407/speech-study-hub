import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { askJson, PROFESSOR } from "./ai.server";
import { sanitizeFlow, type Flow, type FlowContent, type FlowKind } from "./flow";

const KIND_RULES: Record<FlowKind, string> = {
  fisiopatologia:
    'FISIOPATOLOGIA: a cadeia causal, da causa inicial até as manifestações e complicações. Cada caixa é um evento ou mecanismo; a seta significa "leva a". Use "decisao" só quando o caminho realmente se divide (por exemplo, agudo ou crônico). Se existir um ciclo vicioso real, inclua UMA seta de volta com label "ciclo vicioso".',
  conduta:
    'CONDUTA FONOAUDIOLÓGICA: o raciocínio do atendimento, da queixa à avaliação, ao diagnóstico, à terapia ou ao encaminhamento e ao acompanhamento. Use caixas "decisao" nos pontos em que a conduta muda (achado presente ou ausente, grau, resposta à terapia).',
};

/** Gera o fluxograma do tipo pedido e guarda junto do outro tipo, se já existir. */
export const generateFlowchart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ topic_id: z.string().uuid(), kind: z.enum(["fisiopatologia", "conduta"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const [{ data: topic }, { data: materials }] = await Promise.all([
      supabase.from("topics").select("title").eq("id", data.topic_id).single(),
      supabase
        .from("materials")
        .select("type, content")
        .eq("topic_id", data.topic_id)
        .in("type", ["summary", "flowchart"]),
    ]);
    if (!topic) throw new Error("Tópico não encontrado.");
    const byType = new Map((materials ?? []).map((m) => [m.type, m.content]));
    const summary = (byType.get("summary") ?? {}) as { html?: string; text?: string };
    const summaryText = String(summary.html ?? summary.text ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 9000);

    const result = await askJson<unknown>(
      `${PROFESSOR}
Monte um FLUXOGRAMA de estudo do tópico, do tipo: ${KIND_RULES[data.kind]}
Regras:
- De 7 a 14 caixas. "label" com até 8 palavras, sem ponto final.
- "tipo": "inicio" (só a primeira caixa), "passo", "decisao" (pergunta curta terminada em "?", com 2 ou 3 setas saindo, cada uma com "label" curto, como "Sim" e "Não" ou o critério) e "fim" (desfechos).
- "detalhe": 1 ou 2 frases que explicam a caixa (o mecanismo, o critério ou o porquê), para o aluno clicar e ler.
- Mostre os ramos que existem de verdade: mecanismos que acontecem em paralelo e desfechos diferentes ficam em caixas separadas, lado a lado. Não force uma fila única nem junte dois desfechos numa caixa só.
- No máximo 3 caminhos lado a lado. As setas avançam de cima para baixo; não volte, salvo o ciclo vicioso descrito acima.
- Letra maiúscula só no começo do texto, em siglas e em nomes próprios (escreva "Da agressão ao desfecho", não "Da Agressão ao Desfecho").
- Em "detalhe", seja preciso sobre quem faz o quê (célula, mediador, órgão); não atribua uma função a quem não a exerce.
- Só conhecimento consolidado e coerente com o resumo do tópico.
- Texto puro, sem asteriscos e sem markdown.
Responda SOMENTE com JSON: { "titulo": "string", "caixas": [{ "id": "c1", "tipo": "inicio", "label": "string", "detalhe": "string" }], "setas": [{ "de": "c1", "para": "c2", "label": "" }] }`,
      `Tópico: "${String(topic.title)}".
Resumo do tópico (base de conteúdo): ${summaryText || "não disponível"}`,
    );

    const flow = sanitizeFlow(result);
    if (!flow) throw new Error("A IA não devolveu um fluxograma válido. Tente de novo.");
    const full: Flow = { ...flow, created_at: new Date().toISOString() };
    const previous = (byType.get("flowchart") ?? {}) as Partial<FlowContent>;
    const content: FlowContent = { flows: { ...(previous.flows ?? {}), [data.kind]: full } };

    const { error } = await supabase.rpc("set_topic_material", {
      p_topic_id: data.topic_id,
      p_type: "flowchart",
      p_content: content,
    });
    if (error) throw new Error(error.message);
    return { flow: full };
  });
