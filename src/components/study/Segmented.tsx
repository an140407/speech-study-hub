import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Alternador com rádios nativos (as setas do teclado trocam a opção).
 * O rótulo do grupo fica só para leitores de tela.
 */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset className={cn("inline-flex", className)}>
      <legend className="sr-only">{label}</legend>
      <div className="inline-flex rounded-md border border-border bg-card p-0.5">
        {options.map((o) => (
          <label key={o.value} className="relative">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex h-8 cursor-pointer select-none items-center justify-center rounded-[5px] px-3 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground",
                "peer-checked:bg-foreground/[0.07] peer-checked:font-medium peer-checked:text-foreground",
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
