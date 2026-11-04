import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Segundos desde que `running` ficou verdadeiro (zera quando para). */
function useElapsed(running: boolean) {
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) {
      setStart(null);
      return;
    }
    const s = Date.now();
    setStart(s);
    setNow(s);
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  return start === null ? 0 : Math.max(0, Math.floor((now - start) / 1000));
}

const formatElapsed = (s: number) =>
  s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;

/**
 * "Pensando… 12 s": círculo girando + o que a IA está fazendo + tempo de espera.
 * O contador fica fora do leitor de tela (ele leria o número a cada segundo).
 */
export function AiWait({
  active,
  label,
  className,
}: {
  active: boolean;
  label: string;
  className?: string;
}) {
  const seconds = useElapsed(active);
  if (!active) return null;
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
      <span>{label}</span>
      <span
        aria-hidden
        className="shrink-0 whitespace-nowrap font-mono text-xs tnum text-muted-foreground"
      >
        {formatElapsed(seconds)}
      </span>
    </span>
  );
}
