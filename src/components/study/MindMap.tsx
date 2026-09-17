import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Mindmap } from "@/lib/study-types";

const BRANCH_BG = ["bg-branch-1", "bg-branch-2", "bg-branch-3", "bg-branch-4", "bg-branch-5", "bg-branch-6"];
const BRANCH_BORDER = ["border-branch-1", "border-branch-2", "border-branch-3", "border-branch-4", "border-branch-5", "border-branch-6"];
const BRANCH_TEXT = ["text-branch-1", "text-branch-2", "text-branch-3", "text-branch-4", "text-branch-5", "text-branch-6"];

export function MindMap({ map }: { map: Mindmap }) {
  const [open, setOpen] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(map.branches.map((_, i) => [i, true])),
  );
  return (
    <div className="flex flex-col items-center">
      <div className="rounded-2xl bg-primary px-6 py-4 text-center font-serif text-xl font-semibold text-primary-foreground shadow-lift">
        {map.topic}
      </div>
      <div className="h-8 w-px bg-border" />
      <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {map.branches.map((b, i) => {
          const c = i % 6;
          const isOpen = open[i] ?? true;
          return (
            <div key={i} className={cn("card-soft overflow-hidden border-t-4", BRANCH_BORDER[c])}>
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [i]: !isOpen }))}
                className="flex w-full items-center justify-between gap-2 p-4 text-left"
              >
                <span className="flex items-center gap-2 font-semibold">
                  <span className={cn("size-2.5 rounded-full", BRANCH_BG[c])} />
                  {b.title}
                </span>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <ul className="animate-fade-up space-y-1.5 px-4 pb-4">
                  {b.children.map((ch, k) => (
                    <li key={k} className="flex gap-2 text-sm leading-relaxed">
                      <span className={cn("mt-2 h-px w-3 shrink-0", BRANCH_BG[c])} />
                      <span className={cn("rounded-lg bg-muted px-2.5 py-1.5", BRANCH_TEXT[c], "text-foreground")}>{ch}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
