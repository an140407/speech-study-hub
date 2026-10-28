/**
 * A IA às vezes escreve fórmulas em LaTeX: "$SpO_2 > 92\%$", "$O_2$".
 * Isto troca esses trechos por texto comum com caracteres Unicode: "SpO₂ > 92%", "O₂".
 * Dinheiro ("R$ 50") não é tocado: o "$" precisa vir colado no conteúdo, dos dois lados.
 */

const SUB: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
  a: "ₐ",
  e: "ₑ",
  o: "ₒ",
  x: "ₓ",
  h: "ₕ",
  k: "ₖ",
  l: "ₗ",
  m: "ₘ",
  n: "ₙ",
  p: "ₚ",
  s: "ₛ",
  t: "ₜ",
};
const SUP: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  n: "ⁿ",
  i: "ⁱ",
};
const CMD: Record<string, string> = {
  geq: "≥",
  ge: "≥",
  leq: "≤",
  le: "≤",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  sim: "~",
  times: "×",
  cdot: "·",
  pm: "±",
  div: "÷",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  Rightarrow: "⇒",
  uparrow: "↑",
  downarrow: "↓",
  infty: "∞",
  degree: "°",
  circ: "°",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  Delta: "Δ",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  sigma: "σ",
  Sigma: "Σ",
  omega: "ω",
  Omega: "Ω",
  ldots: "…",
  dots: "…",
  "%": "%",
  $: "$",
  "&": "&",
  "#": "#",
  _: "_",
  ",": " ",
  ";": " ",
  ":": " ",
  "!": "",
  " ": " ",
};

function script(text: string, table: Record<string, string>, fallback: string) {
  const chars = [...text];
  return chars.every((c) => table[c]) ? chars.map((c) => table[c]).join("") : fallback + text;
}

function convertMath(src: string) {
  let s = src;
  // \text{...}, \mathrm{...}, \textbf{...} → só o conteúdo
  s = s.replace(
    /\\(?:text|mathrm|textrm|mathbf|textbf|mathit|textit|operatorname)\s*\{([^{}]*)\}/g,
    "$1",
  );
  // \frac{a}{b} → a/b
  s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1/$2");
  // índices e expoentes
  s = s.replace(/_\{([^{}]*)\}/g, (_, t: string) => script(t, SUB, ""));
  s = s.replace(/_([A-Za-z0-9+\-=])/g, (_, t: string) => script(t, SUB, ""));
  s = s.replace(/\^\{([^{}]*)\}/g, (_, t: string) => script(t, SUP, "^"));
  s = s.replace(/\^([A-Za-z0-9+\-=])/g, (_, t: string) => script(t, SUP, "^"));
  // comandos
  s = s.replace(/\\([A-Za-z]+|[%$&#_,;:! ])/g, (m, name: string) => CMD[name] ?? name);
  // chaves que sobraram e espaços repetidos
  s = s
    .replace(/[{}]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return s;
}

/**
 * @param mode "html" para HTML (não atravessa tags) ou "text" para texto puro.
 */
export function delatex(input: string, mode: "html" | "text" = "text"): string {
  if (!input || !input.includes("$")) return input;
  // em HTML, "<" só entra se não for início de tag
  const inner = mode === "html" ? "(?:[^$<\\n]|<(?![A-Za-z/!]))" : "[^$\\n]";
  const re = new RegExp(
    `(?<![A-Za-z0-9\\\\])\\$(?=\\S)(${inner}{1,160}?)(?<=\\S)\\$(?![0-9])`,
    "g",
  );
  return input.replace(re, (_, math: string) => convertMath(math));
}