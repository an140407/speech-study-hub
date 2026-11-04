/**
 * Fluxograma do tópico: tipos, limpeza do que a IA devolve e o cálculo do desenho
 * (camadas de cima para baixo, sem bibliotecas). Usado no servidor e na tela.
 */

export type FlowKind = "fisiopatologia" | "conduta";
export type FlowNodeKind = "inicio" | "passo" | "decisao" | "fim";

export type FlowNode = { id: string; kind: FlowNodeKind; label: string; detail: string };
export type FlowEdge = { from: string; to: string; label: string };
export type Flow = { title: string; nodes: FlowNode[]; edges: FlowEdge[]; created_at: string };
export type FlowContent = { flows: Partial<Record<FlowKind, Flow>> };

export const FLOW_KINDS: { value: FlowKind; label: string }[] = [
  { value: "fisiopatologia", label: "Fisiopatologia" },
  { value: "conduta", label: "Conduta fonoaudiológica" },
];

export const NODE_KIND_LABEL: Record<FlowNodeKind, string> = {
  inicio: "Início",
  passo: "Etapa",
  decisao: "Decisão",
  fim: "Desfecho",
};

const MAX_NODES = 16;
const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/**
 * Confere e arruma o fluxograma da IA: ids únicos, setas só entre caixas que existem,
 * sem setas repetidas e no máximo 16 caixas. Devolve null se sobrar pouco.
 */
export function sanitizeFlow(raw: unknown): Omit<Flow, "created_at"> | null {
  const r = (raw ?? {}) as { titulo?: unknown; caixas?: unknown; setas?: unknown };
  const seen = new Set<string>();
  const nodes: FlowNode[] = [];
  for (const c of Array.isArray(r.caixas) ? r.caixas : []) {
    const box = (c ?? {}) as { id?: unknown; tipo?: unknown; label?: unknown; detalhe?: unknown };
    const id = clean(box.id, 40);
    const label = clean(box.label, 90).replace(/\.$/, "");
    if (!id || !label || seen.has(id)) continue;
    const kind = (["inicio", "passo", "decisao", "fim"] as const).find((k) => k === box.tipo);
    seen.add(id);
    nodes.push({ id, kind: kind ?? "passo", label, detail: clean(box.detalhe, 400) });
    if (nodes.length === MAX_NODES) break;
  }
  const edges: FlowEdge[] = [];
  const pairs = new Set<string>();
  for (const s of Array.isArray(r.setas) ? r.setas : []) {
    const e = (s ?? {}) as { de?: unknown; para?: unknown; label?: unknown };
    const from = clean(e.de, 40);
    const to = clean(e.para, 40);
    const key = `${from}>${to}`;
    if (!seen.has(from) || !seen.has(to) || from === to || pairs.has(key)) continue;
    pairs.add(key);
    edges.push({ from, to, label: clean(e.label, 40) });
  }
  if (nodes.length < 3 || edges.length < 2) return null;
  return { title: clean(r.titulo, 120) || "Fluxograma", nodes, edges };
}

/* ----------------------------- desenho ----------------------------- */

export type Measure = (text: string) => number;
export type Point = { x: number; y: number };

export type PlacedNode = FlowNode & {
  x: number; // canto esquerdo
  y: number; // topo
  w: number;
  h: number;
  lines: string[];
  rank: number;
};

export type PlacedEdge = {
  from: string;
  to: string;
  label: string;
  /** "d" do caminho SVG. */
  path: string;
  /** Onde escrever o rótulo da seta. */
  labelAt: Point | null;
  /** Seta de volta (ciclo), desenhada pela lateral e tracejada. */
  loop: boolean;
};

export type FlowLayout = {
  width: number;
  height: number;
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  /** Ordem de leitura: de cima para baixo, da esquerda para a direita. */
  order: string[];
};

export const FLOW_FONT_SIZE = 14;
export const FLOW_LINE = 19;
const PAD_X = 16;
const PAD_Y = 12;
const DECISION_INSET = 14;
const GAP_X = 28;
const GAP_Y = 56;
const MARGIN = 12;
const DUMMY_W = 8;

/** Largura aproximada quando não há como medir (no servidor). */
export const roughMeasure: Measure = (t) => t.length * FLOW_FONT_SIZE * 0.53;

function wrap(text: string, max: number, measure: Measure) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > max) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Remove setas que fecham ciclos (viram "loops") para as camadas funcionarem. */
function splitLoops(nodes: FlowNode[], edges: FlowEdge[]) {
  const out = new Map<string, FlowEdge[]>();
  for (const n of nodes) out.set(n.id, []);
  for (const e of edges) out.get(e.from)!.push(e);
  const state = new Map<string, 0 | 1 | 2>();
  const loops = new Set<FlowEdge>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const e of out.get(id)!) {
      const s = state.get(e.to) ?? 0;
      if (s === 1) loops.add(e);
      else if (s === 0) visit(e.to);
    }
    state.set(id, 2);
  };
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  for (const n of nodes) if (indeg.get(n.id) === 0 && !state.get(n.id)) visit(n.id);
  for (const n of nodes) if (!state.get(n.id)) visit(n.id);
  return { dag: edges.filter((e) => !loops.has(e)), loops: edges.filter((e) => loops.has(e)) };
}

export function layoutFlow(flow: Pick<Flow, "nodes" | "edges">, measure: Measure): FlowLayout {
  const { nodes } = flow;
  const { dag, loops } = splitLoops(nodes, flow.edges);
  // 1) Camada de cada caixa: o caminho mais longo desde o início
  const preds = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const succs = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of dag) {
    preds.get(e.to)!.push(e.from);
    succs.get(e.from)!.push(e.to);
  }
  const rank = new Map<string, number>();
  const rankOf = (id: string, guard = 0): number => {
    if (rank.has(id)) return rank.get(id)!;
    const ps = preds.get(id)!;
    const r = ps.length && guard < 64 ? Math.max(...ps.map((p) => rankOf(p, guard + 1))) + 1 : 0;
    rank.set(id, r);
    return r;
  };
  for (const n of nodes) rankOf(n.id);
  const perRank = new Map<number, number>();
  for (const n of nodes) perRank.set(rank.get(n.id)!, (perRank.get(rank.get(n.id)!) ?? 0) + 1);
  // Camadas largas (4 ou mais caixas lado a lado) usam caixas mais estreitas
  const W = Math.max(...perRank.values()) >= 4 ? 176 : 208;

  // 2) Pontos intermediários nas setas que pulam camadas, para não cruzarem caixas
  type V = { id: string; w: number; h: number; real: boolean };
  const vertex = new Map<string, V>();
  const sizes = new Map<string, { w: number; h: number; lines: string[] }>();
  for (const n of nodes) {
    const inner = W - PAD_X * 2 - (n.kind === "decisao" ? DECISION_INSET * 2 : 0);
    const lines = wrap(n.label, inner, measure);
    const h = Math.max(44, lines.length * FLOW_LINE + PAD_Y * 2);
    sizes.set(n.id, { w: W, h, lines });
    vertex.set(n.id, { id: n.id, w: W, h, real: true });
  }
  const chains: { edge: FlowEdge; ids: string[] }[] = [];
  const vSuccs = new Map<string, string[]>();
  const vPreds = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    (vSuccs.get(a) ?? vSuccs.set(a, []).get(a)!).push(b);
    (vPreds.get(b) ?? vPreds.set(b, []).get(b)!).push(a);
  };
  dag.forEach((e, i) => {
    const ids = [e.from];
    for (let r = rank.get(e.from)! + 1; r < rank.get(e.to)!; r++) {
      const id = `__d${i}_${r}`;
      vertex.set(id, { id, w: DUMMY_W, h: 0, real: false });
      rank.set(id, r);
      ids.push(id);
    }
    ids.push(e.to);
    for (let k = 0; k < ids.length - 1; k++) link(ids[k]!, ids[k + 1]!);
    chains.push({ edge: e, ids });
  });

  // 3) Ordem dentro de cada camada (baricentro, algumas passadas)
  const maxRank = Math.max(0, ...Array.from(rank.values()));
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  const firstSeen = new Map<string, number>();
  nodes.forEach((n, i) => firstSeen.set(n.id, i));
  for (const id of vertex.keys()) layers[rank.get(id)!]!.push(id);
  for (const layer of layers)
    layer.sort((a, b) => (firstSeen.get(a) ?? 99) - (firstSeen.get(b) ?? 99));
  const pos = new Map<string, number>();
  const index = () => layers.forEach((l) => l.forEach((id, i) => pos.set(id, i)));
  index();
  const bary = (ids: string[] | undefined, fallback: number) =>
    ids?.length ? ids.reduce((s, id) => s + pos.get(id)!, 0) / ids.length : fallback;
  for (let pass = 0; pass < 4; pass++) {
    const down = pass % 2 === 0;
    const seq = down ? layers.slice(1) : layers.slice(0, -1).reverse();
    for (const layer of seq) {
      const key = new Map(
        layer.map((id) => [id, bary(down ? vPreds.get(id) : vSuccs.get(id), pos.get(id)!)]),
      );
      layer.sort((a, b) => key.get(a)! - key.get(b)! || pos.get(a)! - pos.get(b)!);
      layer.forEach((id, i) => pos.set(id, i));
    }
  }

  // 4) Posição horizontal: cada caixa tenta ficar embaixo de quem aponta para ela
  const cx = new Map<string, number>();
  layers.forEach((layer, r) => {
    const want = layer.map((id) => {
      const ps = vPreds.get(id);
      return r > 0 && ps?.length ? ps.reduce((s, p) => s + cx.get(p)!, 0) / ps.length : 0;
    });
    const xs: number[] = [];
    layer.forEach((id, i) => {
      const w = vertex.get(id)!.w;
      if (i === 0) xs.push(want[0]!);
      else {
        const prev = vertex.get(layer[i - 1]!)!.w;
        xs.push(Math.max(want[i]!, xs[i - 1]! + (prev + w) / 2 + GAP_X));
      }
    });
    const shift = xs.reduce((s, x, i) => s + (want[i]! - x), 0) / Math.max(1, xs.length);
    layer.forEach((id, i) => cx.set(id, xs[i]! + shift));
  });

  // 5) Altura das camadas e normalização
  const rankH = layers.map((l) => Math.max(0, ...l.map((id) => vertex.get(id)!.h)));
  const rankY: number[] = [];
  let y = MARGIN;
  rankH.forEach((h, r) => {
    rankY[r] = y;
    y += h + GAP_Y;
  });
  let minX = Infinity;
  let maxX = -Infinity;
  for (const [id, x] of cx) {
    const w = vertex.get(id)!.w;
    minX = Math.min(minX, x - w / 2);
    maxX = Math.max(maxX, x + w / 2);
  }
  const dx = MARGIN - minX;

  const placed: PlacedNode[] = nodes.map((n) => {
    const s = sizes.get(n.id)!;
    const r = rank.get(n.id)!;
    return {
      ...n,
      w: s.w,
      h: s.h,
      lines: s.lines,
      rank: r,
      x: cx.get(n.id)! + dx - s.w / 2,
      y: rankY[r]! + (rankH[r]! - s.h) / 2,
    };
  });
  const byId = new Map(placed.map((p) => [p.id, p]));

  // 6) Setas: curvas suaves de baixo de uma caixa até o topo da seguinte
  const curve = (a: Point, b: Point) => {
    const m = (b.y - a.y) / 2;
    return `C ${a.x} ${a.y + m} ${b.x} ${b.y - m} ${b.x} ${b.y}`;
  };
  const at = (a: Point, b: Point, t: number): Point => {
    const m = (b.y - a.y) / 2;
    const p1 = { x: a.x, y: a.y + m };
    const p2 = { x: b.x, y: b.y - m };
    const u = 1 - t;
    return {
      x: u ** 3 * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * b.x,
      y: u ** 3 * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * b.y,
    };
  };
  const edges: PlacedEdge[] = chains.map(({ edge, ids }) => {
    const src = byId.get(edge.from)!;
    const dst = byId.get(edge.to)!;
    const pts: Point[] = [{ x: src.x + src.w / 2, y: src.y + src.h }];
    for (const id of ids.slice(1, -1)) {
      const r = rank.get(id)!;
      const x = cx.get(id)! + dx;
      pts.push({ x, y: rankY[r]! }, { x, y: rankY[r]! + rankH[r]! });
    }
    pts.push({ x: dst.x + dst.w / 2, y: dst.y });
    let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!;
      const b = pts[k]!;
      d += k % 2 === 1 ? ` ${curve(a, b)}` : ` L ${b.x} ${b.y}`;
    }
    return {
      from: edge.from,
      to: edge.to,
      label: edge.label,
      path: d,
      labelAt: edge.label ? at(pts[0]!, pts[1]!, 0.45) : null,
      loop: false,
    };
  });

  // Ciclos: saem pela direita da caixa, sobem pela lateral e entram pela direita da outra
  let width = maxX - minX + MARGIN * 2;
  loops.forEach((edge, i) => {
    const src = byId.get(edge.from)!;
    const dst = byId.get(edge.to)!;
    const lane = maxX + dx + 24 + i * 16;
    const a = { x: src.x + src.w, y: src.y + src.h / 2 };
    const b = { x: dst.x + dst.w, y: dst.y + dst.h / 2 };
    const r = 10;
    const up = b.y < a.y ? -1 : 1;
    const d = [
      `M ${a.x} ${a.y}`,
      `L ${lane - r} ${a.y}`,
      `Q ${lane} ${a.y} ${lane} ${a.y + up * r}`,
      `L ${lane} ${b.y - up * r}`,
      `Q ${lane} ${b.y} ${lane - r} ${b.y}`,
      `L ${b.x} ${b.y}`,
    ].join(" ");
    // O rótulo do ciclo fica à direita da linha lateral, sem cobrir nenhuma caixa
    const labelW = edge.label ? (measure(edge.label) * 12) / FLOW_FONT_SIZE + 12 : 0;
    edges.push({
      from: edge.from,
      to: edge.to,
      label: edge.label,
      path: d,
      labelAt: edge.label ? { x: lane + 4 + labelW / 2, y: (a.y + b.y) / 2 } : null,
      loop: true,
    });
    width = Math.max(width, lane + 4 + labelW + MARGIN);
  });

  const order = [...placed].sort((a, b) => a.rank - b.rank || a.x - b.x).map((n) => n.id);
  return { width, height: y - GAP_Y + MARGIN, nodes: placed, edges, order };
}

/** Para onde cada caixa leva, com o rótulo da seta ("Sim", "Não"…). */
export function nextSteps(flow: Pick<Flow, "nodes" | "edges">, id: string) {
  const names = new Map(flow.nodes.map((n) => [n.id, n.label]));
  return flow.edges
    .filter((e) => e.from === id)
    .map((e) => ({ label: e.label, to: names.get(e.to) ?? "" }));
}
