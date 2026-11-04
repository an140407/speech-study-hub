import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { List, Loader2, RotateCcw, Sparkles, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AiWait } from "@/components/study/AiWait";
import { Segmented } from "@/components/study/Segmented";
import { supabase } from "@/integrations/supabase/client";
import { aiErrorMessage, withAiRetry } from "@/lib/ai-busy";
import {
  FLOW_FONT_SIZE,
  FLOW_KINDS,
  FLOW_LINE,
  NODE_KIND_LABEL,
  layoutFlow,
  nextSteps,
  roughMeasure,
  type Flow,
  type FlowContent,
  type FlowKind,
  type FlowNodeKind,
  type Measure,
  type PlacedNode,
} from "@/lib/flow";
import { generateFlowchart } from "@/lib/flowchart.functions";
import { cn } from "@/lib/utils";

const eyebrow =
  "font-sans text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground";

const EMPTY_TEXT: Record<FlowKind, string> = {
  fisiopatologia:
    "A cadeia causal do tópico, da causa inicial às manifestações e complicações. Cada caixa traz uma explicação curta.",
  conduta:
    "O raciocínio do atendimento fonoaudiológico, da queixa à terapia e aos encaminhamentos, com as decisões que mudam a conduta. Cada caixa traz uma explicação curta.",
};

/** Cores e formas por tipo de caixa (a forma também muda, não só a cor). */
const SHAPE: Record<FlowNodeKind, { fill: string; text: string; stroke: string }> = {
  inicio: { fill: "fill-tint-2", text: "fill-tint-2-fg", stroke: "stroke-tint-2-fg/30" },
  passo: { fill: "fill-card", text: "fill-foreground", stroke: "stroke-border" },
  decisao: { fill: "fill-tint-4", text: "fill-tint-4-fg", stroke: "stroke-tint-4-fg/30" },
  fim: { fill: "fill-tint-1", text: "fill-tint-1-fg", stroke: "stroke-tint-1-fg/30" },
};

/** Mede o texto com a fonte real da página; no servidor, usa uma estimativa. */
function useMeasure(): Measure {
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => {
    if (typeof document === "undefined") return roughMeasure;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return roughMeasure;
    ctx.font = `400 ${FLOW_FONT_SIZE}px ${getComputedStyle(document.body).fontFamily || "sans-serif"}`;
    // Pequena folga para diferenças de arredondamento entre canvas e SVG
    return (t: string) => ctx.measureText(t).width * 1.04;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontsReady]);
}

export function Flowchart({ topicId }: { topicId: string }) {
  const queryClient = useQueryClient();
  const generate = useServerFn(generateFlowchart);
  const [kind, setKind] = useState<FlowKind>("fisiopatologia");
  const [view, setView] = useState<"diagrama" | "lista">("diagrama");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["flowchart", topicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("content")
        .eq("topic_id", topicId)
        .eq("type", "flowchart")
        .maybeSingle();
      if (error) throw error;
      return ((data?.content as Partial<FlowContent> | null)?.flows ?? {}) as FlowContent["flows"];
    },
  });

  const flow = q.data?.[kind] ?? null;
  useEffect(() => setSelected(null), [kind, flow]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await withAiRetry(
        () => generate({ data: { topic_id: topicId, kind } }),
        (wait) => setRetryMsg(`A IA está congestionada. Tentando de novo em ${wait} s…`),
      );
      await queryClient.invalidateQueries({ queryKey: ["flowchart", topicId] });
      toast.success("Fluxograma pronto.");
    } catch (e) {
      const msg = aiErrorMessage(e, "Não deu para montar o fluxograma.");
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setRetryMsg(null);
    }
  }

  return (
    <section aria-labelledby="fluxograma-titulo">
      <h2 id="fluxograma-titulo" className="sr-only">
        Fluxograma
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Tipo de fluxograma"
          value={kind}
          onChange={setKind}
          options={FLOW_KINDS}
        />
        {flow && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              aria-pressed={view === "lista"}
              onClick={() => setView(view === "lista" ? "diagrama" : "lista")}
            >
              {view === "lista" ? (
                <Workflow className="size-4" aria-hidden />
              ) : (
                <List className="size-4" aria-hidden />
              )}
              {view === "lista" ? "Ver como fluxograma" : "Ver como lista"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void run()} disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RotateCcw className="size-4" aria-hidden />
              )}
              {busy ? "Montando…" : "Gerar de novo"}
            </Button>
          </div>
        )}
      </div>

      <p aria-live="polite" className={cn("mt-3 text-sm", error ? "text-destructive" : "sr-only")}>
        {error ?? retryMsg ?? (busy ? "Montando o fluxograma." : "")}
      </p>
      <AiWait
        active={busy && !error}
        label={retryMsg ?? "Montando o fluxograma"}
        className="mt-3"
      />

      {q.isLoading ? (
        <div className="mt-6 h-72 animate-pulse rounded-lg bg-foreground/[0.04]" aria-busy="true" />
      ) : !flow ? (
        busy ? (
          <FlowSkeleton />
        ) : (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-dashed border-border px-5 py-5">
            <p className="max-w-[56ch] text-sm text-muted-foreground">{EMPTY_TEXT[kind]}</p>
            <Button size="sm" onClick={() => void run()}>
              <Sparkles className="size-4" aria-hidden /> Criar fluxograma
            </Button>
          </div>
        )
      ) : (
        <div className={cn("mt-5", busy && "opacity-60 transition-opacity")}>
          <h3 className="font-serif text-[1.6rem] leading-tight">{flow.title}</h3>
          {view === "diagrama" ? (
            <>
              <Legend />
              <FlowDiagram flow={flow} selected={selected} onSelect={setSelected} />
              <p className="mt-2 text-xs text-muted-foreground sm:hidden">
                Arraste o desenho para os lados, ou use “Ver como lista”.
              </p>
              <NodeDetail flow={flow} id={selected} />
            </>
          ) : (
            <FlowList flow={flow} />
          )}
        </div>
      )}
    </section>
  );
}

function FlowSkeleton() {
  return (
    <div className="mt-6 grid justify-items-center gap-5" aria-hidden>
      {[56, 44, 44, 56].map((h, i) => (
        <div
          key={i}
          className="w-52 animate-pulse rounded-lg bg-foreground/[0.06]"
          style={{ height: h, animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}

function Legend() {
  const items: { kind: FlowNodeKind; label: string }[] = [
    { kind: "inicio", label: "Início" },
    { kind: "passo", label: "Etapa" },
    { kind: "decisao", label: "Decisão" },
    { kind: "fim", label: "Desfecho" },
  ];
  return (
    <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground" aria-hidden>
      {items.map((it) => (
        <li key={it.kind} className="flex items-center gap-1.5">
          <svg width="22" height="12" viewBox="0 0 22 12">
            <NodeShape kind={it.kind} x={0.5} y={0.5} w={21} h={11} small />
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  );
}

function NodeShape({
  kind,
  x,
  y,
  w,
  h,
  small,
  className,
}: {
  kind: FlowNodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  small?: boolean;
  className?: string;
}) {
  const s = SHAPE[kind];
  const cls = cn(s.fill, s.stroke, "transition-[stroke,stroke-width]", className);
  if (kind === "decisao") {
    const i = small ? 4 : 14;
    const pts = [
      [x + i, y],
      [x + w - i, y],
      [x + w, y + h / 2],
      [x + w - i, y + h],
      [x + i, y + h],
      [x, y + h / 2],
    ]
      .map((p) => p.join(","))
      .join(" ");
    return <polygon points={pts} className={cls} strokeWidth={1} />;
  }
  const r = kind === "passo" ? (small ? 2 : 8) : h / 2;
  return (
    <rect x={x} y={y} width={w} height={h} rx={Math.min(r, 22)} className={cls} strokeWidth={1} />
  );
}

function FlowDiagram({
  flow,
  selected,
  onSelect,
}: {
  flow: Flow;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const measure = useMeasure();
  const layout = useMemo(() => layoutFlow(flow, measure), [flow, measure]);
  const arrow = `seta-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const box = useRef<HTMLDivElement>(null);
  // No celular o desenho fica mais largo que a tela: começa rolado até a primeira caixa
  useEffect(() => {
    const el = box.current;
    const first = layout.nodes.find((n) => n.id === layout.order[0]);
    if (!el || !first || el.scrollWidth <= el.clientWidth) return;
    const offset = Math.max(0, (el.scrollWidth - layout.width) / 2);
    el.scrollLeft = offset + first.x + first.w / 2 - el.clientWidth / 2;
  }, [layout]);
  const related = (from: string, to: string) =>
    selected !== null && (from === selected || to === selected);

  return (
    <div
      ref={box}
      className="mt-4 overflow-x-auto rounded-lg border border-border bg-background py-4"
    >
      <svg
        role="group"
        aria-label={`Fluxograma: ${flow.title}. Use Tab para percorrer as caixas e Enter para ler a explicação.`}
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="mx-auto block max-w-none"
        onKeyDown={(e) => e.key === "Escape" && onSelect(null)}
      >
        <defs>
          <marker
            id={arrow}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" className="fill-muted-foreground" />
          </marker>
        </defs>

        <g aria-hidden>
          {layout.edges.map((e, i) => (
            <path
              key={i}
              d={e.path}
              fill="none"
              strokeWidth={related(e.from, e.to) ? 2 : 1.25}
              strokeDasharray={e.loop ? "5 4" : undefined}
              markerEnd={`url(#${arrow})`}
              className={cn(
                "transition-[stroke,stroke-width]",
                related(e.from, e.to) ? "stroke-foreground" : "stroke-muted-foreground/70",
              )}
            />
          ))}
          {layout.edges.map((e, i) =>
            e.labelAt ? (
              <EdgeLabel
                key={`l${i}`}
                x={e.labelAt.x}
                y={e.labelAt.y}
                text={e.label}
                measure={measure}
              />
            ) : null,
          )}
        </g>

        {layout.order.map((id) => {
          const n = byId.get(id)!;
          return (
            <FlowNodeView
              key={id}
              node={n}
              selected={selected === id}
              next={nextSteps(flow, id)}
              onSelect={() => onSelect(selected === id ? null : id)}
            />
          );
        })}
      </svg>
    </div>
  );
}

function EdgeLabel({
  x,
  y,
  text,
  measure,
}: {
  x: number;
  y: number;
  text: string;
  measure: Measure;
}) {
  const w = (measure(text) * 12) / FLOW_FONT_SIZE + 12;
  return (
    <g>
      <rect x={x - w / 2} y={y - 10} width={w} height={20} rx={4} className="fill-background" />
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        className="fill-muted-foreground font-sans text-[12px] font-medium"
      >
        {text}
      </text>
    </g>
  );
}

function FlowNodeView({
  node,
  selected,
  next,
  onSelect,
}: {
  node: PlacedNode;
  selected: boolean;
  next: { label: string; to: string }[];
  onSelect: () => void;
}) {
  const s = SHAPE[node.kind];
  const firstBaseline = node.y + (node.h - node.lines.length * FLOW_LINE) / 2 + FLOW_LINE * 0.74;
  const leads = next.length
    ? ` Leva a: ${next.map((n) => (n.label ? `${n.label}, ${n.to}` : n.to)).join("; ")}.`
    : "";
  return (
    <g
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${NODE_KIND_LABEL[node.kind]}: ${node.label}.${leads}`}
      className="group cursor-pointer outline-none"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <NodeShape
        kind={node.kind}
        x={node.x}
        y={node.y}
        w={node.w}
        h={node.h}
        className={cn(
          "group-hover:stroke-foreground/60",
          "group-focus-visible:stroke-ring group-focus-visible:[stroke-width:3px]",
          selected && "stroke-foreground [stroke-width:2px]",
        )}
      />
      <text textAnchor="middle" className={cn(s.text, "pointer-events-none font-sans text-[14px]")}>
        {node.lines.map((line, i) => (
          <tspan key={i} x={node.x + node.w / 2} y={firstBaseline + i * FLOW_LINE}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function NodeDetail({ flow, id }: { flow: Flow; id: string | null }) {
  const node = id ? flow.nodes.find((n) => n.id === id) : null;
  const next = node ? nextSteps(flow, node.id) : [];
  return (
    <div aria-live="polite" className="mt-4 min-h-[5.5rem] border-l-2 border-foreground/15 pl-4">
      {node ? (
        <>
          <p className={eyebrow}>{NODE_KIND_LABEL[node.kind]}</p>
          <p className="mt-1 font-serif text-[1.3rem] leading-snug">{node.label}</p>
          {node.detail && (
            <p className="mt-1.5 max-w-[68ch] text-[0.98rem] leading-relaxed">{node.detail}</p>
          )}
          {next.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              Leva a:{" "}
              {next.map((n, i) => (
                <span key={i}>
                  {i > 0 && "; "}
                  {n.label && <span className="font-medium text-foreground">{n.label}: </span>}
                  {n.to}
                </span>
              ))}
            </p>
          )}
        </>
      ) : (
        <p className="pt-1 text-sm text-muted-foreground">
          Clique numa caixa (ou use Tab e Enter) para ler a explicação dela.
        </p>
      )}
    </div>
  );
}

/** A mesma informação em texto: para ler no celular, imprimir ou usar com leitor de tela. */
function FlowList({ flow }: { flow: Flow }) {
  const measure = roughMeasure;
  const order = useMemo(() => layoutFlow(flow, measure).order, [flow, measure]);
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const number = new Map(order.map((id, i) => [id, i + 1]));
  return (
    <ol className="mt-4 divide-y divide-border border-y border-border">
      {order.map((id) => {
        const n = byId.get(id)!;
        const next = flow.edges.filter((e) => e.from === id);
        return (
          <li key={id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 py-4">
            <span className="pt-0.5 text-right font-mono text-sm text-muted-foreground tnum">
              {number.get(id)}
            </span>
            <div>
              <p className={eyebrow}>{NODE_KIND_LABEL[n.kind]}</p>
              <p className="mt-0.5 font-medium">{n.label}</p>
              {n.detail && (
                <p className="mt-1 max-w-[68ch] text-[0.95rem] leading-relaxed text-muted-foreground">
                  {n.detail}
                </p>
              )}
              {next.length > 0 && (
                <p className="mt-1.5 text-sm">
                  <span className="text-muted-foreground">Leva a </span>
                  {next.map((e, i) => (
                    <span key={i}>
                      {i > 0 && "; "}
                      {e.label && <span className="font-medium">{e.label}: </span>}
                      {byId.get(e.to)?.label}{" "}
                      <span className="text-muted-foreground tnum">({number.get(e.to)})</span>
                    </span>
                  ))}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
