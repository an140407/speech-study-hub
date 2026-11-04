/**
 * Mnemônicos do tópico: tipo, conferência das letras e destaque das iniciais.
 * Usado no servidor (para descartar mnemônicos com letras erradas) e na tela.
 */

export type MnemonicKind = "sigla" | "frase" | "outro";

export type Mnemonic = {
  lista: string;
  /** Ausente nos mnemônicos antigos, criados antes da conferência de letras. */
  tipo?: MnemonicKind;
  mnemonico: string;
  /** Só na frase: as palavras que carregam as iniciais, uma por item. */
  chaves?: string[];
  itens: string[];
  explicacao: string;
  classico: boolean;
};

/** Maiúsculas e sem acento, para comparar letras. */
export function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();
}

/** Primeira letra ou número do texto, sem acento. */
export function initialOf(text: string) {
  return fold(text).match(/[A-Z0-9]/)?.[0] ?? "";
}

/** Primeira letra do texto como aparece (com acento), para mostrar na tela. */
export function displayInitial(text: string) {
  return (text.match(/[\p{L}\p{N}]/u)?.[0] ?? "").toUpperCase();
}

const bare = (word: string) => fold(word).replace(/[^A-Z0-9]/g, "");

/**
 * Confere o mnemônico. Sigla: as letras são as iniciais dos itens, na ordem.
 * Frase: cada palavra-chave começa com a inicial do item e aparece na frase, na ordem.
 * "Outro" (regra numérica etc.) só passa quando é clássico. Devolve null se não bater.
 */
export function checkMnemonic(raw: unknown): Mnemonic | null {
  const m = (raw ?? {}) as {
    lista?: unknown;
    mnemonico?: unknown;
    itens?: unknown;
    classico?: unknown;
    explicacao?: unknown;
    tipo?: unknown;
    chaves?: unknown;
  };
  const lista = String(m.lista ?? "").trim();
  const mnemonico = String(m.mnemonico ?? "").trim();
  const itens = (Array.isArray(m.itens) ? m.itens : [])
    .map((x) => String(x).trim())
    .filter(Boolean);
  if (!lista || !mnemonico || itens.length < 2) return null;

  const classico = m.classico === true;
  const base = { lista, mnemonico, itens, explicacao: String(m.explicacao ?? "").trim(), classico };
  const want = itens.map(initialOf);

  if (m.tipo === "sigla") {
    return bare(mnemonico) === want.join("") ? { ...base, tipo: "sigla" } : null;
  }

  if (m.tipo === "frase") {
    const chaves = (Array.isArray(m.chaves) ? m.chaves : [])
      .map((x) => String(x).trim())
      .filter(Boolean);
    if (chaves.length !== itens.length) return null;
    if (chaves.some((c, i) => initialOf(c) !== want[i])) return null;
    const words = mnemonico.split(/\s+/).map(bare);
    let from = 0;
    for (const c of chaves) {
      const at = words.indexOf(bare(c), from);
      if (at < 0) return null;
      from = at + 1;
    }
    return { ...base, tipo: "frase", chaves };
  }

  return classico ? { ...base, tipo: "outro" } : null;
}

/**
 * Quebra a frase em pedaços e marca a inicial de cada palavra-chave, na ordem,
 * para a tela sublinhar só essas letras.
 */
export function phraseParts(phrase: string, chaves: string[]) {
  const parts: { text: string; key: boolean }[] = [];
  let k = 0;
  for (const token of phrase.split(/(\s+)/)) {
    const target = chaves[k];
    if (target && token.trim() && bare(token) === bare(target)) {
      const i = token.search(/[\p{L}\p{N}]/u);
      if (i > 0) parts.push({ text: token.slice(0, i), key: false });
      parts.push({ text: token.charAt(i), key: true });
      parts.push({ text: token.slice(i + 1), key: false });
      k += 1;
    } else {
      parts.push({ text: token, key: false });
    }
  }
  return parts.filter((p) => p.text);
}
