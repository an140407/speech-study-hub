import { useId } from "react";
import { cn } from "@/lib/utils";
import { useTheme, type ThemeChoice } from "@/lib/theme";

const OPTIONS: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: "claro", label: "Claro", hint: "Caderno: papel claro" },
  { value: "escuro", label: "Escuro", hint: "Caderno noturno: papel escuro" },
  { value: "auto", label: "Auto", hint: "Segue o tema do sistema" },
];

/** Seletor de tema com rádios nativos: setas do teclado trocam a opção, como em qualquer grupo de rádio. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { choice, setChoice } = useTheme();
  const name = useId();

  return (
    <fieldset className={cn("flex items-center justify-between gap-3", className)}>
      <legend className="sr-only">Tema</legend>
      <span
        aria-hidden
        className="font-sans text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground"
      >
        Tema
      </span>
      <div className="inline-flex rounded-md border border-sidebar-border p-0.5">
        {OPTIONS.map((o) => (
          <label key={o.value} title={o.hint} className="relative">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={choice === o.value}
              onChange={() => setChoice(o.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex h-7 min-w-[3.25rem] cursor-pointer select-none items-center justify-center rounded-[5px] px-2 text-xs transition-colors",
                "text-muted-foreground hover:text-foreground",
                "peer-checked:bg-sidebar-accent peer-checked:font-medium peer-checked:text-foreground peer-checked:shadow-soft",
                "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
              )}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
