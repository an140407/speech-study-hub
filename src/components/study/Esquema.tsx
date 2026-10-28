import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, EyeOff, Layers, ListChecks, Printer, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FlashcardRow, McqRow, Mindmap } from "@/lib/study-types";

/**
 * Esquema (substitui o antigo mapa mental).
 * - "Ver tudo": cada ramo em um bloco pastel, com o quanto já foi praticado.
 * - "Cobrir respostas": os itens ficam escondidos para a pessoa tentar lembrar
 *   antes de revelar, e marcar se lembrou. Tudo fica salvo só neste navegador.
 * - "Praticar este ramo": abre os flashcards daquele ramo (ou as questões).
 * - "Exportar PDF": imprime o esquema; no modo cobrir, sai com linhas em branco.
 */

const TINTS = [
  { bg: "bg-tint-1", fg: "text-tint-1-fg", dot: "bg-tint-1-fg" },
  { bg: "bg-tint-2", fg: "text-tint-2-fg", dot: "bg-tint-2-fg" },
  { bg: "bg-tint-3", fg: "text-tint-3-fg", dot: "bg-tint-3-fg" },
  { bg: "bg-tint-4", fg: "text-tint-4-fg", dot: "bg-tint-4-fg" },
  { bg: "bg-tint-5", fg: "text-tint-5-fg", dot: "bg-tint-5-fg" },
];

type Mark = "ok" | "miss";
type ItemState = { revealed: boolean; mark?: Mark };
type Saved = { sig: string; cover: boolean; items: Record<string, ItemState> };
export type PracticeTarget = "flashcards" | "questoes";

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFC").trim().toLocaleLowerCase("pt-BR");
const storageKey = (topicId: string) => `fonolab:esquema:${topicId}`;

function readSaved(topicId: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(storageKey(topicId));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function writeSaved(topicId: string, value: Saved) {
  try {
    window.localStorage.setItem(storageKey(topicId), JSON.stringify(value));
  } catch {
    // navegador sem armazenamento (aba anônima, bloqueio): segue funcionando sem salvar
  }
}

export function Esquema({
  map,
  topicId,
  flashcards,
  mcq,
  onPractice,
}: {
  map: Mindmap;
  topicId: string;
  flashcards: FlashcardRow[];
  mcq: McqRow[];
  onPractice: (target: PracticeTarget, subtopic: string | null) => void;
}) {
  const branches = useMemo(() => map.branches ?? [], [map.branches]);
  const sig = useMemo(
    () => branches.map((b) => `${b.title}#${b.children.length}`).join("|"),
    [branches],
  );
  const totalItems = branches.reduce((n, b) => n + b.children.length, 0);

  const [cover, setCover] = useState(false);
  const [items, setItems] = useState<Record<string, ItemState>>({});
  const [loaded, setLoaded] = useState(false);
  const [justRevealed, setJustRevealed] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [printing, setPrinting] = useState(false);

  // Carrega o que a pessoa já tinha marcado (só depois de montar, por causa do SSR)
  useEffect(() => {
    const saved = readSaved(topicId);
    if (saved && saved.sig === sig) {
      setCover(saved.cover);
      setItems(saved.items ?? {});
    }
    setLoaded(true);
  }, [topicId, sig]);

  useEffect(() => {
    if (loaded) writeSaved(topicId, { sig, cover, items });
  }, [loaded, topicId, sig, cover, items]);

  // Impressão: monta uma cópia limpa do esquema direto no <body> e chama o print
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done, { once: true });
    const t = window.setTimeout(() => window.print(), 60);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  const stats = useMemo(
    () =>
      branches.map((b) => {
        const k = norm(b.title);
        const fc = flashcards.filter((f) => norm(f.subtopic) === k);
        const qs = mcq.filter((q) => norm(q.subtopic) === k);
        const total = fc.length + qs.length;
        const seen = fc.filter((f) => f.seen_at).length + qs.filter((q) => q.seen_at).length;
        return {
          fc: fc.length,
          q: qs.length,
          total,
          seen,
          pct: total ? Math.round((seen * 100) / total) : 0,
          // nome exato gravado nos cards, para o filtro dos flashcards bater certinho
          subtopic: fc[0]?.subtopic ?? qs[0]?.subtopic ?? null,
        };
      }),
    [branches, flashcards, mcq],
  );

  const keyOf = (bi: number, ci: number) => `${bi}:${ci}`;
  const marks = Object.values(items);
  const okCount = marks.filter((s) => s.mark === "ok").length;
  const missCount = marks.filter((s) => s.mark === "miss").length;
  const touched = marks.some((s) => s.revealed);

  function reveal(bi: number, ci: number) {
    const k = keyOf(bi, ci);
    setItems((s) => ({ ...s, [k]: { revealed: true } }));
    setJustRevealed(k);
    setAnnounce(`${branches[bi]?.title}: ${branches[bi]?.children[ci]}`);
  }

  function markItem(bi: number, ci: number, mark: Mark) {
    const k = keyOf(bi, ci);
    setItems((s) => ({ ...s, [k]: { revealed: true, mark } }));
    setJustRevealed(null);
  }

  function restart() {
    setItems({});
    setAnnounce("Esquema coberto de novo.");
  }

  function coverMissed() {
    setItems((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v.mark !== "miss")));
    setAnnounce("Os itens esquecidos foram cobertos de novo.");
  }

  if (!branches.length) {
    return <p className="text-muted-foreground">Este tópico não tem esquema.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {cover ? (
            <span aria-live="polite">
              Você lembrou <strong className="font-semibold text-foreground tnum">{okCount}</strong>{" "}
              de <span className="tnum">{totalItems}</span> itens.
            </span>
          ) : (
            <>
              {branches.length} ramos · {totalItems} itens. Ligue “Cobrir respostas” para se testar.
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {cover && touched && (
            <Button variant="ghost" size="sm" onClick={restart}>
              <RotateCcw className="size-4" aria-hidden /> Recomeçar
            </Button>
          )}
          <div
            role="group"
            aria-label="Modo do esquema"
            className="inline-flex rounded-lg border border-border bg-card p-1"
          >
            {[
              { v: false, label: "Ver tudo" },
              { v: true, label: "Cobrir respostas" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={cover === o.v}
                onClick={() => setCover(o.v)}
                className={cn(
                  "h-9 rounded-md px-3 text-sm font-medium transition-colors",
                  cover === o.v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-11 sm:h-9"
            onClick={() => setPrinting(true)}
          >
            <Printer className="size-4" aria-hidden /> Exportar PDF
          </Button>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <div className="mt-4 grid gap-3.5 md:grid-cols-2 lg:grid-cols-3">
        {branches.map((b, bi) => {
          const t = TINTS[bi % TINTS.length]!;
          const s = stats[bi]!;
          const remembered = b.children.filter(
            (_, ci) => items[keyOf(bi, ci)]?.mark === "ok",
          ).length;
          const headingId = `esquema-ramo-${bi}`;
          return (
            <section
              key={bi}
              aria-labelledby={headingId}
              className={cn("flex flex-col rounded-xl p-5", t.bg)}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 id={headingId} className={cn("text-[1.65rem] leading-[1.08]", t.fg)}>
                  {b.title}
                </h2>
                {cover && (
                  <span className={cn("mt-1.5 shrink-0 text-xs font-medium tnum", t.fg)}>
                    {remembered} de {b.children.length}
                  </span>
                )}
              </div>

              {!cover && (
                <div className="mt-3">
                  <div className="h-1 overflow-hidden rounded-full bg-black/10" aria-hidden>
                    <div
                      className={cn("h-full rounded-full", t.dot)}
                      style={{ width: `${s.pct}%` }}
                    />
                  </div>
                  <p className={cn("mt-1.5 text-xs tnum", t.fg)}>
                    {s.total
                      ? `Praticado: ${s.seen} de ${s.total} · ${s.pct}%`
                      : "Ainda sem cartões ou questões deste ramo"}
                  </p>
                </div>
              )}

              <ul className="mt-3 flex-1">
                {b.children.map((child, ci) => {
                  const k = keyOf(bi, ci);
                  const st = items[k];
                  const rowClass = "border-t border-black/[0.07] first:border-t-0";
                  if (!cover) {
                    return (
                      <li
                        key={ci}
                        className={cn(
                          rowClass,
                          "flex items-start gap-2.5 py-2 text-[0.95rem] leading-snug",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn("mt-[0.55em] size-1.5 shrink-0 rounded-full", t.dot)}
                        />
                        <span>{child}</span>
                      </li>
                    );
                  }
                  if (!st?.revealed) {
                    return (
                      <li key={ci} className={rowClass}>
                        <button
                          type="button"
                          onClick={() => reveal(bi, ci)}
                          aria-label={`Revelar item ${ci + 1} de ${b.title}`}
                          className="flex min-h-11 w-full items-center gap-2.5 rounded-md py-1 text-left sm:min-h-9"
                        >
                          <EyeOff aria-hidden className={cn("size-4 shrink-0 opacity-70", t.fg)} />
                          <span aria-hidden className="esquema-cover h-3 flex-1 rounded-sm" />
                          <span className={cn("text-xs font-medium", t.fg)}>revelar</span>
                        </button>
                      </li>
                    );
                  }
                  return (
                    <li
                      key={ci}
                      className={cn(
                        rowClass,
                        "flex items-start gap-2.5 py-1.5 text-[0.95rem] leading-snug",
                      )}
                    >
                      {st.mark === "ok" ? (
                        <Check
                          aria-hidden
                          className={cn("mt-0.5 size-4 shrink-0", t.fg)}
                          strokeWidth={2.6}
                        />
                      ) : st.mark === "miss" ? (
                        <X
                          aria-hidden
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          strokeWidth={2.6}
                        />
                      ) : (
                        <span
                          aria-hidden
                          className={cn("mt-[0.55em] size-1.5 shrink-0 rounded-full", t.dot)}
                        />
                      )}
                      <span className="flex-1 pt-px">
                        {child}
                        {st.mark && (
                          <span className="sr-only">
                            {st.mark === "ok" ? " (lembrei)" : " (não lembrei)"}
                          </span>
                        )}
                      </span>
                      {!st.mark && (
                        <span className="-my-1 flex shrink-0 gap-1">
                          <button
                            type="button"
                            autoFocus={justRevealed === k}
                            onClick={() => markItem(bi, ci, "ok")}
                            aria-label={`Lembrei: ${child}`}
                            title="Lembrei"
                            className={cn(
                              "flex size-11 items-center justify-center rounded-md bg-card/70 transition-colors hover:bg-card sm:size-8",
                              t.fg,
                            )}
                          >
                            <Check className="size-4" strokeWidth={2.6} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => markItem(bi, ci, "miss")}
                            aria-label={`Não lembrei: ${child}`}
                            title="Não lembrei"
                            className="flex size-11 items-center justify-center rounded-md bg-card/70 text-muted-foreground transition-colors hover:bg-card sm:size-8"
                          >
                            <X className="size-4" strokeWidth={2.6} aria-hidden />
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={!s.total}
                  onClick={() => onPractice(s.fc ? "flashcards" : "questoes", s.subtopic)}
                  title={s.total ? undefined : "Ainda não há flashcards nem questões deste ramo"}
                  className="inline-flex h-11 items-center gap-2 rounded-md bg-card/75 px-3 text-sm font-medium text-foreground transition-colors hover:bg-card active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 sm:h-9"
                >
                  {s.fc ? (
                    <Layers className="size-4" aria-hidden />
                  ) : (
                    <ListChecks className="size-4" aria-hidden />
                  )}
                  Praticar este ramo
                </button>
                <span className={cn("text-xs tnum", t.fg)}>
                  {s.fc} {s.fc === 1 ? "cartão" : "cartões"} · {s.q}{" "}
                  {s.q === 1 ? "questão" : "questões"}
                </span>
              </div>
            </section>
          );
        })}

        <section
          aria-label="Como usar o esquema"
          className="flex flex-col justify-center rounded-xl border border-dashed border-border p-5"
        >
          {cover && missCount > 0 ? (
            <>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Segunda volta
              </p>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-foreground">
                Você não lembrou <strong className="font-semibold tnum">{missCount}</strong>{" "}
                {missCount === 1 ? "item" : "itens"}. Cubra só esses e tente de novo.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-11 self-start sm:h-9"
                onClick={coverMissed}
              >
                <EyeOff className="size-4" aria-hidden /> Cobrir os esquecidos
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Como usar
              </p>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-foreground">
                Com <strong className="font-semibold">Cobrir respostas</strong> ligado, tente
                lembrar cada item antes de revelar e marque se lembrou. Depois, “Praticar este ramo”
                leva aos flashcards daquele ramo.
              </p>
            </>
          )}
        </section>
      </div>

      {printing &&
        createPortal(
          <div className="esquema-portal">
            <p className="esquema-print-kicker">Esquema · FonoLab</p>
            <h1 className="esquema-print-title">{map.topic}</h1>
            <div className="esquema-print-grid">
              {branches.map((b, bi) => {
                const t = TINTS[bi % TINTS.length]!;
                return (
                  <section key={bi} className={cn("esquema-print-block", t.bg)}>
                    <h2 className={t.fg}>{b.title}</h2>
                    <ul>
                      {b.children.map((child, ci) => (
                        <li key={ci}>{cover ? <span className="esquema-print-blank" /> : child}</li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}