import { useId, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Escolha de quantidade (1 a max) para os diálogos de "Gerar mais".
 * - Botões − e + e atalhos (5, 10, 20…) resolvem no toque, sem teclado.
 * - O campo aceita digitação livre (pode apagar tudo e digitar "12"); o número só é
 *   conferido e ajustado ao limite quando sai do campo ou aperta Enter.
 */
export function QuantityPicker({
  id,
  label = "Quantidade",
  value,
  onChange,
  max,
  presets = [5, 10, 20],
}: {
  id: string;
  label?: string;
  value: number;
  onChange: (n: number) => void;
  max: number;
  presets?: number[];
}) {
  // Texto em digitação; null = mostra o valor confirmado (botões e atalhos aparecem na hora)
  const [draft, setDraft] = useState<string | null>(null);
  // Tentou passar do máximo: o campo trava no limite e o aviso embaixo fica em destaque
  const [capped, setCapped] = useState(false);
  const hintId = useId();
  const clamp = (n: number) => Math.max(1, Math.min(max, Math.round(n)));

  function commit() {
    if (draft === null) return;
    const n = Number.parseInt(draft, 10);
    setDraft(null);
    if (Number.isFinite(n) && clamp(n) !== value) onChange(clamp(n)); // vazio volta ao anterior
  }

  // ± parte do que está no campo (inclusive o que ainda está sendo digitado)
  const step = (d: number) => {
    const n = draft === null ? value : Number.parseInt(draft, 10);
    setDraft(null);
    setCapped(false);
    onChange(clamp((Number.isFinite(n) ? n : value) + d));
  };
  // Enquanto digita, o atalho marcado acompanha o que está no campo
  const typed = draft === null ? value : Number.parseInt(draft, 10);
  const shown = presets.filter((p) => p < max);
  if (!shown.includes(max) && max > 1) shown.push(max);

  const stepBtn =
    "flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground transition-[background-color,transform] hover:bg-accent active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40";

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          className={stepBtn}
          onClick={() => step(-1)}
          disabled={value <= 1}
          aria-label="Diminuir"
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <input
          id={id}
          name={id}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint="done"
          value={draft ?? String(value)}
          aria-describedby={hintId}
          maxLength={String(max).length}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, String(max).length);
            const over = Number.parseInt(digits, 10) > max;
            setCapped(over);
            setDraft(over ? String(max) : digits);
          }}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => {
            commit();
            setCapped(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              step(1);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              step(-1);
            }
          }}
          className="h-11 w-20 rounded-md border border-input bg-card text-center text-lg font-medium outline-none transition-[border-color,box-shadow] tnum focus:border-ring focus:shadow-[0_0_0_3px_rgb(35_70_168/18%)]"
        />
        <button
          type="button"
          className={stepBtn}
          onClick={() => step(1)}
          disabled={value >= max}
          aria-label="Aumentar"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>

      {shown.length > 1 && (
        <div role="group" aria-label="Atalhos de quantidade" className="mt-3 flex flex-wrap gap-2">
          {shown.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setCapped(false);
                onChange(p);
              }}
              aria-pressed={typed === p}
              className={cn(
                "h-9 min-w-12 rounded-full border px-3 text-sm tnum transition-colors",
                typed === p
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground/80 hover:text-foreground",
              )}
            >
              {p === max && !presets.includes(p) ? `Máx. ${p}` : p}
            </button>
          ))}
        </div>
      )}

      <p
        id={hintId}
        aria-live="polite"
        className={cn(
          "mt-2 text-xs tnum transition-colors",
          capped ? "font-medium text-tint-3-fg" : "text-muted-foreground",
        )}
      >
        {capped ? `O máximo é ${max} por vez.` : `De 1 a ${max} por vez.`}
      </p>
    </div>
  );
}