import { cn } from "@/lib/utils";

/**
 * Marca do FonoLab (proposta Caderno): "F" em serifa sobre bloco tinta,
 * com o traço amarelo do marca-texto atrás. A letra é um desenho (path),
 * então não depende da fonte ter carregado.
 */
const F_PATH =
  "M24.47 48Q23.76 48 23.76 47.48Q23.76 47.06 24.37 46.91L25.46 46.73Q26.45 46.54 26.76 46.21Q27.06 45.88 27.06 44.88V17.12Q27.06 16.12 26.76 15.79Q26.45 15.46 25.46 15.27L24.37 15.09Q23.76 14.94 23.76 14.52Q23.76 14 24.47 14H39.67Q40.76 14 40.85 15.09L41.23 22.93Q41.33 23.73 40.62 23.73Q40.05 23.73 39.96 23.11L39.72 21.56Q39.34 19.1 38.4 17.73Q37.45 16.36 36.27 15.77Q35.09 15.18 34.01 15.18Q31.93 15.18 31.17 15.84Q30.42 16.5 30.42 17.87V29.02Q30.42 29.68 31.08 29.68H32.73Q34.81 29.68 35.28 27.46L35.8 25.1Q35.94 24.48 36.51 24.48Q37.08 24.48 37.08 25.29V35.91Q37.08 36.71 36.51 36.71Q35.94 36.71 35.8 36.1L35.28 33.79Q34.95 32.13 34.36 31.61Q33.77 31.09 32.68 31.09H31.08Q30.42 31.09 30.42 31.76V44.65Q30.42 45.64 30.72 46.04Q31.03 46.44 32.02 46.58L34.24 46.91Q34.76 47.01 34.76 47.43Q34.76 48 34.05 48Z";

export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("size-8 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <rect width="64" height="64" rx="14" fill="#1A1917" />
      <rect
        x="12"
        y="38"
        width="40"
        height="10"
        rx="2"
        fill="#FFD84D"
        transform="rotate(-5 32 43)"
      />
      <path d={F_PATH} fill="#FAF9F6" stroke="#FAF9F6" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

/** "Fono" reto e "lab" itálico, em Instrument Serif. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      translate="no"
      className={cn("font-serif text-[1.7rem] leading-none tracking-[-0.02em]", className)}
    >
      Fono<i className="italic">lab</i>
    </span>
  );
}