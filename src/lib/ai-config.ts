/**
 * Configuração da IA do FonoLab: quais modelos usar e as regras de formato que se repetem
 * entre a geração completa (gemini.server.ts) e a geração avulsa (study-extra.functions.ts).
 */

/** Modelo principal: mais preciso em conteúdo da área da saúde. */
export const MODEL_MAIN = "gemini-3.5-flash";
/** Reserva: mais leve; entra quando o principal está sem cota, congestionado ou indisponível. */
export const MODEL_FALLBACK = "gemini-3.1-flash-lite";

/** Vale tentar o modelo reserva? 429 = cota ou limite, 404 = modelo indisponível, 5xx = congestionado. */
export function shouldFallback(status: number) {
  return status === 429 || status === 404 || status >= 500;
}

/** Caso clínico de Fonoaudiologia em seções fixas. O cenário é exibido como texto puro, linha a linha. */
export const CASE_RULES = `CASO CLÍNICO (formato de discussão de caso em Fonoaudiologia):
- "scenario" com 220 a 380 palavras, em texto puro (sem markdown, sem asteriscos, sem #), uma seção por linha, nesta ordem, cada linha começando pelo rótulo seguido de dois-pontos:
Identificação: ...
Queixa principal: ... (entre aspas, nas palavras do paciente ou do responsável)
História clínica: ... (início e evolução da queixa, desenvolvimento, antecedentes pessoais e familiares, hábitos, exposições e medicamentos quando forem relevantes)
Avaliação fonoaudiológica: ... (testes, protocolos e instrumentos pelo nome, com os resultados; em audiologia, limiares com orelha, frequência e unidade, ex.: "OD: 45 dB NA em 4 kHz")
Exames complementares: ... (avaliações de outros profissionais e exames de imagem ou laboratório, só quando fizerem sentido)
Evolução: ... (opcional: o que aconteceu depois ou o que motivou o encaminhamento)
- O caso precisa exigir raciocínio: os achados sustentam a hipótese diagnóstica sem entregá-la. Nunca escreva o diagnóstico no cenário.
- "guiding_questions" de 5 a 10, na sequência de uma discussão de caso: dados relevantes e problemas do caso; hipóteses diagnósticas fonoaudiológicas e diferenciais; bases anatômicas e fisiológicas que explicam os achados; interpretação dos testes e exames; conduta (terapia, orientações e encaminhamentos) e prognóstico. Cada "answer" é completa e cita os achados do caso que a sustentam.
- "case_explanation" com 120 a 220 palavras: hipótese diagnóstica mais provável, o raciocínio que leva a ela e a conduta fonoaudiológica esperada.`;

/** Questões objetivas com vinheta clínica. Vinheta e enunciado ficam separados por uma linha em branco. */
export const MCQ_RULES = `QUESTÕES DE MÚLTIPLA ESCOLHA (estilo prova de Fonoaudiologia, concursos e residência multiprofissional):
- Pelo menos 7 em cada 10 questões começam com uma VINHETA CLÍNICA de 40 a 90 palavras (paciente, idade, queixa, achados da avaliação fonoaudiológica e exames relevantes com unidades), seguida de UMA LINHA EM BRANCO ("\\n\\n") e do enunciado: UMA frase curta (até 25 palavras) que é só a pergunta. Todos os dados do paciente, inclusive resultados de testes e exames, ficam na vinheta, nunca depois da linha em branco. As demais podem ser conceituais diretas (anatomia e fisiologia, classificação, testes e protocolos), sem vinheta e sem linha em branco.
- Exatamente 4 alternativas plausíveis e do mesmo tipo (todas diagnósticos, ou todas condutas etc.). Nada de "todas as anteriores", "nenhuma das anteriores" ou pegadinha de português.
- "explanation" diz por que a correta está certa e por que cada distratora está errada, em 2 a 5 frases, em texto puro (sem asteriscos nem outra marcação).
- A vinheta e o enunciado nunca contêm a resposta nem uma pista direta dela: não escreva o nome do diagnóstico, do achado ou do conceito pedido (por exemplo, numa questão sobre perda auditiva condutiva, a vinheta não diz "caracterizando uma perda condutiva"). Dê os achados e deixe o aluno concluir.
- Distribua as respostas corretas entre as posições 0, 1, 2 e 3.`;
