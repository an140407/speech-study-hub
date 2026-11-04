import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { cleanTitle, useTopicsList } from "@/lib/topics-index";
import { useFolders } from "@/lib/folders";
import { computeMistakes, useAttempts } from "@/lib/attempts";
import { scoreFormat } from "@/lib/essays";
import { accuracySeries, periodStart, useStatsData, type Period } from "@/lib/stats";

type Search = { periodo?: Period; modulo?: string };

export const Route = createFileRoute("/_authenticated/estatisticas")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {};
    if (s["periodo"] === "7" || s["periodo"] === "30" || s["periodo"] === "tudo") out.periodo = s["periodo"];
    if (typeof s["modulo"] === "string" && s["modulo"]) out.modulo = s["modulo"];
    return out;
  },
  head: () => ({
    meta: [
      { title: "Desempenho — FonoLab" },
      { name: "description", content: "Acerto por tópico e ramo, provas e discursivas ao longo do tempo." },
    ],
  }),
  component: StatsPage,
});

const eyebrow = "font-sans text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground";
const MIN_RAMO = 3; // ramo só entra nos "pontos fracos" com pelo menos 3 respostas
const PERIODS: { v: Period; label: string }[] = [
  { v: "7", label: "7 dias" },
  { v: "30", label: "30 dias" },
  { v: "tudo", label: "Tudo" },
];

function StatsPage() {
  const { periodo = "30", modulo } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const attempts = useAttempts();
  const extra = useStatsData();
  const topics = useTopicsList();
  const folders = useFolders();

  const modules = (folders.data ?? []).filter((f) => !f.parent_id);
  const since = periodStart(periodo);

  // Tópicos da disciplina escolhida (a disciplina e as unidades dentro dela).
  const topicIds = useMemo(() => {
    if (!modulo) return null;
    const inside = new Set([modulo, ...(folders.data ?? []).filter((f) => f.parent_id === modulo).map((f) => f.id)]);
    return new Set((topics.data ?? []).filter((t) => t.folder_id && inside.has(t.folder_id)).map((t) => t.id));
  }, [modulo, folders.data, topics.data]);
  const inScope = (topicId: string, at: string) =>
    new Date(at).getTime() >= since && (!topicIds || topicIds.has(topicId));

  const scoped = useMemo(
    () => (attempts.data ?? []).filter((a) => inScope(a.topic_id, a.created_at)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attempts.data, since, topicIds],
  );
  const essays = (extra.data?.essays ?? []).filter((e) => inScope(e.topic_id, e.created_at));
  // Provas não guardam tópico; com filtro de disciplina, conta as provas que tiveram respostas dessa disciplina.
  const examIdsInModule = new Set(scoped.map((a) => a.exam_attempt_id).filter(Boolean));
  const exams = (extra.data?.exams ?? []).filter(
    (e) => new Date(e.created_at).getTime() >= since && (!topicIds || examIdsInModule.has(e.id)),
  );

  const topicTitle = (id: string) => cleanTitle(topics.data?.find((t) => t.id === id)?.title ?? "Tópico");
  const ok = scoped.filter((a) => a.is_correct).length;
  const pct = scoped.length ? Math.round((ok / scoped.length) * 100) : null;
  const examAvg = exams.length
    ? Math.round((exams.reduce((s, e) => s + e.score / e.total, 0) / exams.length) * 100)
    : null;
  const essayAvg = essays.length ? essays.reduce((s, e) => s + e.score, 0) / essays.length : null;
  const pending = computeMistakes(attempts.data ?? []).pending.length;
  const series = useMemo(() => accuracySeries(scoped, periodo), [scoped, periodo]);

  const byTopic = useMemo(() => {
    const map = new Map<string, { ok: number; n: number; ramos: Map<string, { ok: number; n: number }> }>();
    for (const a of scoped) {
      const t = map.get(a.topic_id) ?? { ok: 0, n: 0, ramos: new Map() };
      t.n++;
      if (a.is_correct) t.ok++;
      const ramo = extra.data?.subtopicOf[a.question_id] ?? "Sem ramo";
      const r = t.ramos.get(ramo) ?? { ok: 0, n: 0 };
      r.n++;
      if (a.is_correct) r.ok++;
      t.ramos.set(ramo, r);
      map.set(a.topic_id, t);
    }
    const essayBy = new Map<string, number[]>();
    for (const e of essays) essayBy.set(e.topic_id, [...(essayBy.get(e.topic_id) ?? []), e.score]);
    const ids = new Set([...map.keys(), ...essayBy.keys()]);
    return [...ids]
      .map((id) => {
        const t = map.get(id);
        const ramos = [...(t?.ramos ?? new Map()).entries()]
          .filter(([, r]) => r.n >= MIN_RAMO)
          .map(([name, r]) => ({ name, pct: Math.round((r.ok / r.n) * 100), ok: r.ok, n: r.n }));
        const scores = essayBy.get(id) ?? [];
        return {
          id,
          title: topicTitle(id),
          ok: t?.ok ?? 0,
          n: t?.n ?? 0,
          pct: t?.n ? Math.round((t.ok / t.n) * 100) : null,
          essayAvg: scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : null,
          ramos,
          weakest: ramos.slice().sort((a, b) => a.pct - b.pct)[0] ?? null,
        };
      })
      .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, essays.length, extra.data, topics.data]);

  const weakRamos = byTopic
    .flatMap((t) => t.ramos.map((r) => ({ ...r, topicId: t.id, topic: t.title })))
    .filter((r) => r.pct < 70)
    .sort((a, b) => a.pct - b.pct || b.n - a.n)
    .slice(0, 6);

  const loading = attempts.isLoading || extra.isLoading;
  const empty = !loading && !scoped.length && !essays.length && !exams.length;

  const setSearch = (patch: { periodo?: Period; modulo?: string | undefined }) =>
    void navigate({
      search: (prev: Search) => {
        const next: Search = { ...prev };
        if (patch.periodo) next.periodo = patch.periodo;
        if ("modulo" in patch) {
          if (patch.modulo) next.modulo = patch.modulo;
          else delete next.modulo;
        }
        return next;
      },
      replace: true,
    });

  return (
    <main className="mx-auto w-full max-w-[960px] px-5 pb-24 pt-8 sm:px-8 lg:pt-12">
      <p className={eyebrow}>Estatísticas</p>
      <h1 className="mt-2 text-[2.6rem] leading-none tracking-[-0.02em] sm:text-6xl">Desempenho</h1>
      <p className="mt-4 max-w-[60ch] text-muted-foreground">
        Questões objetivas (prática, provas e caderno de erros) e discursivas corrigidas. Os dados
        começam a contar a partir das respostas registradas no app.
      </p>

      {/* Filtros numa linha só, acima de tudo */}
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="group" aria-label="Período" className="inline-flex rounded-md border border-border p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.v}
              type="button"
              aria-pressed={periodo === p.v}
              onClick={() => setSearch({ periodo: p.v })}
              className={cn(
                "h-8 rounded-[5px] px-3 text-[0.8125rem] transition-colors",
                periodo === p.v
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {modules.length > 0 && (
          <div role="group" aria-label="Disciplina" className="flex flex-wrap gap-1.5">
            {[{ id: "", name: "Todas as disciplinas" }, ...modules].map((m) => (
              <button
                key={m.id || "todos"}
                type="button"
                aria-pressed={(modulo ?? "") === m.id}
                onClick={() => setSearch({ modulo: m.id || undefined })}
                className={cn(
                  "h-8 max-w-[16rem] truncate rounded-md border px-3 text-[0.8125rem] transition-colors",
                  (modulo ?? "") === m.id
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                )}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="mt-10 space-y-4" aria-busy="true" aria-label="Carregando">
          {[90, 60, 75].map((w, i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-foreground/[0.06]" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : empty ? (
        <div className="mt-10 rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-serif text-2xl">Nada registrado neste período</p>
          <p className="mx-auto mt-2 max-w-[48ch] text-sm text-muted-foreground">
            Responda questões, faça um Modo Prova ou corrija uma discursiva. Os números aparecem aqui.
          </p>
        </div>
      ) : (
        <>
          {/* Indicadores */}
          <dl className="mt-8 grid grid-cols-2 border-y border-border md:grid-cols-4">
            <Kpi label="acerto nas objetivas" value={pct === null ? "—" : `${pct}%`} detail={`${ok} de ${scoped.length} respostas`} />
            <Kpi label="média nas provas" value={examAvg === null ? "—" : `${examAvg}%`} detail={`${exams.length} ${exams.length === 1 ? "prova" : "provas"}`} />
            <Kpi
              label="média nas discursivas"
              value={essayAvg === null ? "—" : scoreFormat.format(essayAvg)}
              detail={`${essays.length} ${essays.length === 1 ? "correção" : "correções"}`}
            />
            <Kpi
              label="no caderno de erros"
              value={String(pending)}
              detail={
                <Link to="/erros" className="underline decoration-border underline-offset-4 hover:decoration-foreground">
                  revisar agora
                </Link>
              }
            />
          </dl>

          {/* Evolução */}
          {series.length > 1 && (
            <section aria-labelledby="evolucao" className="mt-12">
              <h2 id="evolucao" className="text-[1.75rem] leading-none">
                Acerto ao longo do tempo
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                % de acerto nas objetivas {periodo === "7" ? "por dia" : "por semana"}. Pontos vazios são
                períodos sem resposta.
              </p>
              <div className="mt-5 h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                    <CartesianGrid vertical={false} stroke="var(--color-border)" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={{ stroke: "var(--color-border)" }}
                      tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                      interval="preserveStartEnd"
                      minTickGap={16}
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 50, 100]}
                      tickFormatter={(v: number) => `${v}%`}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                    />
                    <Tooltip
                      cursor={{ stroke: "var(--color-muted-foreground)", strokeDasharray: "3 3" }}
                      content={({ active, payload }) => {
                        const p = payload?.[0]?.payload as (typeof series)[number] | undefined;
                        if (!active || !p) return null;
                        return (
                          <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lift">
                            <p className="font-medium text-foreground">{p.label}</p>
                            <p className="mt-0.5 text-muted-foreground tnum">
                              {p.n ? `${p.pct}% · ${p.ok} de ${p.n}` : "sem respostas"}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="pct"
                      stroke="var(--color-foreground)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "var(--color-foreground)", stroke: "var(--color-background)", strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: "var(--color-foreground)", stroke: "var(--color-background)", strokeWidth: 2 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver em tabela</summary>
                <table className="mt-2 w-full max-w-md text-left tnum">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-1 font-normal">Período</th>
                      <th className="py-1 font-normal">Acerto</th>
                      <th className="py-1 font-normal">Respostas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((s) => (
                      <tr key={s.label} className="border-t border-border">
                        <td className="py-1">{s.label}</td>
                        <td className="py-1">{s.n ? `${s.pct}%` : "—"}</td>
                        <td className="py-1">{s.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </section>
          )}

          {/* Pontos fracos */}
          {weakRamos.length > 0 && (
            <section aria-labelledby="fracos" className="mt-12">
              <h2 id="fracos" className="text-[1.75rem] leading-none">
                Onde você mais erra
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Ramos abaixo de 70%, com pelo menos {MIN_RAMO} respostas. Comece por cima.
              </p>
              <ul className="mt-5 divide-y divide-border border-y border-border">
                {weakRamos.map((r) => (
                  <li key={`${r.topicId}-${r.name}`} className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-medium" title={r.name}>
                        {r.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{r.topic}</p>
                    </div>
                    <Meter pct={r.pct} label={`${r.ok}/${r.n} · ${r.pct}%`} />
                    <Link
                      to="/topico/$id"
                      params={{ id: r.topicId }}
                      search={{ aba: "questoes" }}
                      className="text-sm text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                    >
                      Praticar
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Por tópico */}
          {byTopic.length > 0 && (
            <section aria-labelledby="por-topico" className="mt-12">
              <h2 id="por-topico" className="text-[1.75rem] leading-none">
                Por tópico
              </h2>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b-[1.5px] border-foreground text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">
                      <th className="pb-2 font-medium">Tópico</th>
                      <th className="w-44 pb-2 font-medium">Objetivas</th>
                      <th className="w-24 pb-2 font-medium">Discursivas</th>
                      <th className="pb-2 font-medium">Ramo mais fraco</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {byTopic.map((t) => (
                      <tr key={t.id} className="align-top">
                        <td className="py-3 pr-4">
                          <Link
                            to="/topico/$id"
                            params={{ id: t.id }}
                            className="font-serif text-[1.15rem] leading-tight hover:text-foreground/75"
                          >
                            {t.title}
                          </Link>
                        </td>
                        <td className="py-3.5 pr-4">
                          {t.pct === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Meter pct={t.pct} label={`${t.ok}/${t.n} · ${t.pct}%`} />
                          )}
                        </td>
                        <td className="py-3.5 pr-4 tnum">
                          {t.essayAvg === null ? <span className="text-muted-foreground">—</span> : scoreFormat.format(t.essayAvg)}
                        </td>
                        <td className="py-3.5 text-muted-foreground">
                          {t.weakest ? (
                            <>
                              <span className="text-foreground">{t.weakest.name}</span> · {t.weakest.pct}%
                            </>
                          ) : (
                            `menos de ${MIN_RAMO} respostas por ramo`
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: React.ReactNode }) {
  return (
    <div className="border-border py-5 pr-4 odd:border-r md:border-r md:pl-4 md:first:pl-0 md:last:border-r-0 [&:nth-child(n+3)]:border-t md:[&:nth-child(n+3)]:border-t-0 [&:nth-child(even)]:pl-4">
      <dt className="sr-only">{label}</dt>
      <dd className="font-serif text-5xl leading-none tnum">{value}</dd>
      <dd className="mt-1.5 text-sm text-muted-foreground">{label}</dd>
      <dd className="mt-0.5 text-xs text-muted-foreground tnum">{detail}</dd>
    </div>
  );
}

/** Barra fina de acerto, sempre com o número ao lado (a barra só reforça). */
function Meter({ pct, label }: { pct: number; label: string }) {
  return (
    <span className="flex items-center gap-3">
      <span aria-hidden className="relative h-[3px] w-20 shrink-0 rounded-full bg-border">
        <span className="absolute inset-y-0 left-0 rounded-full bg-foreground" style={{ width: `${Math.max(pct, 2)}%` }} />
      </span>
      <span className="whitespace-nowrap text-sm tnum">{label}</span>
    </span>
  );
}
