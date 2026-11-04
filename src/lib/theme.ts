import { useEffect, useState } from "react";

/**
 * Tema do FonoLab: Claro (Caderno), Escuro (Caderno noturno) ou Auto (segue o sistema).
 * A escolha fica salva neste navegador. O script de início (THEME_INIT_SCRIPT) roda no
 * <head> antes da página aparecer, então não há "piscada" de tema claro ao abrir.
 */

export type ThemeChoice = "claro" | "escuro" | "auto";

export const THEME_KEY = "fonolab:tema";
const PAPER_LIGHT = "#FAF9F6";
const PAPER_DARK = "#161513";

/** Roda no <head>: aplica o tema salvo, acompanha o sistema no modo Auto e imprime sempre no claro. */
export const THEME_INIT_SCRIPT = `(function(){
var K=${JSON.stringify(THEME_KEY)},r=document.documentElement,mq=window.matchMedia("(prefers-color-scheme: dark)");
function c(){try{var v=localStorage.getItem(K);return v==="claro"||v==="escuro"?v:"auto"}catch(e){return "auto"}}
function a(){var d=c()==="escuro"||(c()==="auto"&&mq.matches);r.classList.toggle("dark",d);
var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?${JSON.stringify(PAPER_DARK)}:${JSON.stringify(PAPER_LIGHT)})}
a();document.addEventListener("DOMContentLoaded",a);
if(mq.addEventListener)mq.addEventListener("change",function(){if(c()==="auto")a()});
window.addEventListener("beforeprint",function(){if(r.classList.contains("dark")){r.classList.remove("dark");r.setAttribute("data-print-dark","")}});
window.addEventListener("afterprint",function(){if(r.hasAttribute("data-print-dark")){r.classList.add("dark");r.removeAttribute("data-print-dark")}});
})();`;

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "claro" || v === "escuro" ? v : "auto";
  } catch {
    return "auto";
  }
}

function applyTheme(choice: ThemeChoice) {
  const dark =
    choice === "escuro" ||
    (choice === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? PAPER_DARK : PAPER_LIGHT);
  // Dois quadros depois, as transições voltam ao normal.
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
}

export function useTheme() {
  const [choice, setChoiceState] = useState<ThemeChoice>("auto");

  useEffect(() => {
    setChoiceState(readChoice());
  }, []);

  function setChoice(next: ThemeChoice) {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Navegação privada sem armazenamento: o tema vale só até fechar a página.
    }
    setChoiceState(next);
    applyTheme(next);
  }

  return { choice, setChoice };
}
