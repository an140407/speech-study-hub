/**
 * Questões com vinheta clínica chegam como "vinheta\n\nenunciado". Separa as duas partes
 * para mostrar a vinheta como texto corrido e só a pergunta em destaque.
 *
 * Rede de segurança: se o enunciado vier comprido (a IA às vezes põe dados clínicos depois
 * da linha em branco, ou a questão antiga não tem linha em branco), só a última frase (a
 * pergunta) fica em destaque e o resto passa para a vinheta.
 */

// Fim de frase seguido de espaço e de uma letra maiúscula, número ou abre-aspas/parênteses.
const SENTENCE_END = /[.!?…]["”')\]]?\s+(?=[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ0-9"“(])/g;

function splitLastSentence(text: string): [string | null, string] {
  let cut = -1;
  for (const m of text.matchAll(SENTENCE_END)) cut = (m.index ?? 0) + m[0].length;
  if (cut <= 0) return [null, text];
  return [text.slice(0, cut).trim(), text.slice(cut).trim()];
}

export function splitVignette(question: string): { vignette: string | null; stem: string } {
  const text = question.trim();
  let vignette: string | null = null;
  let stem = text;

  const i = text.lastIndexOf("\n\n");
  if (i !== -1) {
    const v = text.slice(0, i).trim();
    const s = text.slice(i + 2).trim();
    if (v && s) {
      vignette = v;
      stem = s;
    }
  }

  if (stem.length > 160 && stem.endsWith("?")) {
    const [before, last] = splitLastSentence(stem);
    if (before && last.length >= 15) {
      vignette = vignette ? `${vignette}\n\n${before}` : before;
      stem = last;
    }
  }

  return { vignette, stem };
}
