import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Mindmap } from "@/lib/study-types";

const BRANCH_BG = ["bg-branch-1", "bg-branch-2", "bg-branch-3", "bg-branch-4", "bg-branch-5", "bg-branch-6"];
const BRANCH_BORDER = ["border-branch-1", "border-branch-2", "border-branch-3", "border-branch-4", "border-branch-5", "border-branch-6"];
const STROKE = ["var(--branch-1)", "var(--branch-2)", "var(--branch-3)", "var(--branch-4)", "var(--branch-5)", "var(--branch-6)"];

type Point = { x: number; y: number };

/** Curva suave (bézier cúbica horizontalizada) entre o centro e o ramo. */
function curve(from: Point, to: Point): string {
  const dx = (to.x - from.x) / 2;
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

export function MindMap({ map }: { map: Mindmap }) {
  const [open, setOpen] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(map.branches.map((_, i) => [i, false])),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = map.branches.length;
  const radial = width >= 760 && n > 0;
  const height = radial ? Math.max(560, n * 110) : 0;

  // Posições radiais (em leque completo ao redor do centro)
  const cx = width / 2;
  const cy = height / 2;
  const rx = Math.min(width * 0.34, 330);
  const ry = Math.min(height * 0.36, 260);
  const positions: Point[] = map.branches.map((_, i) => {
    const angle = (-90 + (360 * i) / Math.max(1, n)) * (Math.PI / 180);
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });

  return (
    <div ref={containerRef} className="w-full">
      {radial ? (
        <div className="relative" style={{ height }}>
          <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
            {positions.map((p, i) => (
              <path
                key={i}
                d={curve({ x: cx, y: cy }, p)}
                fill="none"
                stroke={STROKE[i % 6]}
                strokeWidth={2.5}
                strokeLinecap="round"
                opacity={0.7}
              />
            ))}
          </svg>

          <div
            className="absolute z-10 max-w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-primary px-6 py-4 text-center font-serif text-xl font-semibold text-primary-foreground shadow-lift"
            style={{ left: cx, top: cy }}
          >
            {map.topic}
          </div>

          {map.branches.map((b, i) => {
            const c = i % 6;
            const isOpen = open[i] ?? false;
            const p = positions[i]!;
            return (
              <div
                key={i}
                className={cn("card-soft absolute z-20 w-64 -translate-x-1/2 -translate-y-1/2 overflow-hidden border-l-4", BRANCH_BORDER[c])}
                style={{ left: p.x, top: p.y }}
              >
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [i]: !isOpen }))}
                  className="flex w-full items-center justify-between gap-2 p-3 text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className={cn("size-2.5 shrink-0 rounded-full", BRANCH_BG[c])} />
                    {b.title}
                  </span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <ul className="animate-fade-up space-y-1.5 px-3 pb-3">
                    {b.children.map((ch, k) => (
                      <li key={k} className="flex gap-2 text-xs leading-relaxed">
                        <span className={cn("mt-2 h-px w-3 shrink-0", BRANCH_BG[c])} />
                        <span className="rounded-lg bg-muted px-2 py-1.5">{ch}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        // Mobile / telas estreitas: tronco vertical com ramos ligados por curvas
        <div className="relative">
          <div className="mx-auto w-fit max-w-full rounded-2xl bg-primary px-5 py-3 text-center font-serif text-lg font-semibold text-primary-foreground shadow-lift">
            {map.topic}
          </div>
          <div className="relative mt-2 pl-8">
            <svg className="pointer-events-none absolute left-0 top-0 h-full w-8" aria-hidden preserveAspectRatio="none">
              <line x1="16" y1="0" x2="16" y2="100%" stroke="var(--border)" strokeWidth={2} />
            </svg>
            <ul className="space-y-3">
              {map.branches.map((b, i) => {
                const c = i % 6;
                const isOpen = open[i] ?? false;
                return (
                  <li key={i} className="relative">
                    <svg className="pointer-events-none absolute -left-8 top-4 h-6 w-8" viewBox="0 0 32 24" aria-hidden>
                      <path d="M 16 0 C 16 16, 16 12, 32 12" fill="none" stroke={STROKE[c]} strokeWidth={2.5} strokeLinecap="round" />
                    </svg>
                    <div className={cn("card-soft overflow-hidden border-l-4", BRANCH_BORDER[c])}>
                      <button
                        type="button"
                        onClick={() => setOpen((o) => ({ ...o, [i]: !isOpen }))}
                        className="flex w-full items-center justify-between gap-2 p-3 text-left"
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          <span className={cn("size-2.5 shrink-0 rounded-full", BRANCH_BG[c])} />
                          {b.title}
                        </span>
                        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                      </button>
                      {isOpen && (
                        <ul className="animate-fade-up space-y-1.5 px-3 pb-3">
                          {b.children.map((ch, k) => (
                            <li key={k} className="flex gap-2 text-xs leading-relaxed">
                              <span className={cn("mt-2 h-px w-3 shrink-0", BRANCH_BG[c])} />
                              <span className="rounded-lg bg-muted px-2 py-1.5">{ch}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
