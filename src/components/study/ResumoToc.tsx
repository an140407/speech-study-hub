import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Sumário do resumo na margem (telas largas). Lê os títulos <h2> do HTML do resumo,
 * rola até a seção ao clicar e marca a seção que está na tela.
 */
export function ResumoToc({ html }: { html: string }) {
  const items = useMemo(() => {
    if (typeof window === "undefined") return [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    return [...doc.querySelectorAll("h2")].map((h, i) => {
      const text = (h.textContent ?? "").trim();
      const m = text.match(/^(\d{1,2})[.)]\s*(.+)$/);
      return { num: m?.[1] ?? String(i + 1), label: m?.[2] ?? text };
    });
  }, [html]);

  const [active, setActive] = useState(0);

  useEffect(() => {
    const heads = [...document.querySelectorAll<HTMLElement>(".resumo-editor .ProseMirror h2")];
    if (!heads.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (!visible.length) return;
        const top = visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const idx = heads.indexOf(top!.target as HTMLElement);
        if (idx >= 0) setActive(idx);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    heads.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [items]);

  function go(i: number) {
    const heads = document.querySelectorAll<HTMLElement>(".resumo-editor .ProseMirror h2");
    heads[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(i);
  }

  if (items.length < 2) return null;

  return (
    <div className="sticky top-8">
      <p className="mb-3 text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Neste resumo
      </p>
      <ol className="space-y-0.5 border-l border-border">
        {items.map((it, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => go(i)}
              aria-current={i === active ? "true" : undefined}
              className={cn(
                "-ml-px flex w-full gap-2.5 border-l-2 py-1.5 pl-3 pr-1 text-left text-[0.8125rem] leading-snug transition-colors",
                i === active
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="shrink-0 tnum">{it.num.padStart(2, "0")}</span>
              <span>{it.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}