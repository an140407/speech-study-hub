import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useId, useMemo, useState } from "react";
import { Layers, Search as SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useFolders } from "@/lib/folders";
import { getGlossary } from "@/lib/glossary.functions";
import { letterOf, termKey, type GlossaryEntry } from "@/lib/glossary";
import { cleanTitle } from "@/lib/topics-index";
import { cn } from "@/lib/utils";

type Search = { q?: string; modulo?: string };

export const Route = createFileRoute("/_authenticated/glossario")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {};
    if (typeof s["q"] === "string" && s["q"]) out.q = s["q"].slice(0, 80);
    if (typeof s["modulo"] === "string" && s["modulo"]) out.modulo = s["modulo"];
    return out;
  },
  head: () => ({
    meta: [
      { title: "Glossário — FonoLab" },
      {
        name: "description",
        content: "Os termos importantes de todos os tópicos, em ordem alfabética.",
      },
    ],
  }),
  component: GlossaryPage,
});

const eyebrow =
  "font-sans text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground";
const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];

function GlossaryPage() {
  const { q = "", modulo } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const load = useServerFn(getGlossary);
  const glossary = useQuery({
    queryKey: ["glossary"],
    queryFn: () => load(),
    staleTime: 5 * 60 * 1000,
  });
  const folders = useFolders();
  const modules = useMemo(() => (folders.data ?? []).filter((f) => !f.parent_id), [folders.data]);
  const searchId = useId();

  // Busca digitada: atualiza a URL só depois de uma pausa, para não pesar a digitação
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text === q) return;
    const t = window.setTimeout(() => setSearch({ q: text.trim() || undefined }), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const setSearch = (patch: { q?: string | undefined; modulo?: string | undefined }) =>
    void navigate({
      search: (prev: Search) => {
        const next: Search = { ...prev };
        for (const k of ["q", "modulo"] as const) {
          if (!(k in patch)) continue;
          const v = patch[k];
          if (v) next[k] = v;
          else delete next[k];
        }
        return next;
      },
      replace: true,
    });

  const entries = useMemo(() => {
    let list = glossary.data?.entries ?? [];
    if (modulo) {
      const inside = new Set([
        modulo,
        ...(folders.data ?? []).filter((f) => f.parent_id === modulo).map((f) => f.id),
      ]);
      list = list
        .map((e) => ({
          ...e,
          definitions: e.definitions.filter((d) => d.folderId && inside.has(d.folderId)),
        }))
        .filter((e) => e.definitions.length);
    }
    const needle = termKey(q);
    if (needle) {
      list = list.filter(
        (e) =>
          e.key.includes(needle) || e.definitions.some((d) => termKey(d.text).includes(needle)),
      );
    }
    return list;
  }, [glossary.data, modulo, folders.data, q]);

  const groups = useMemo(() => {
    const map = new Map<string, GlossaryEntry[]>();
    for (const e of entries) {
      const l = letterOf(e.term);
      (map.get(l) ?? map.set(l, []).get(l)!).push(e);
    }
    return LETTERS.filter((l) => map.has(l)).map((l) => ({ letter: l, items: map.get(l)! }));
  }, [entries]);
  const available = new Set(groups.map((g) => g.letter));
  const total = glossary.data?.entries.length ?? 0;

  return (
    <main className="mx-auto w-full max-w-[960px] px-5 pb-24 pt-8 sm:px-8 lg:pt-12">
      <p className={eyebrow}>Revisão</p>
      <h1 className="mt-2 text-[2.6rem] leading-none tracking-[-0.02em] sm:text-6xl">Glossário</h1>
      <p className="mt-4 max-w-[60ch] text-muted-foreground">
        Os termos da seção “Termos importantes” de cada resumo, juntos e em ordem alfabética. Quando
        o mesmo termo aparece em mais de um tópico, as definições ficam lado a lado.
      </p>

      <div className="mt-8 grid gap-3">
        <div className="relative max-w-[28rem]">
          <label htmlFor={searchId} className="sr-only">
            Buscar no glossário
          </label>
          <SearchIcon
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            id={searchId}
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Buscar termo ou definição…"
            autoComplete="off"
            className="h-11 w-full rounded-md border border-input bg-card pl-9 pr-3 text-[0.9375rem] outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-ring)_18%,transparent)]"
          />
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

      {glossary.isLoading ? (
        <div className="mt-10 space-y-5" aria-busy="true" aria-label="Carregando o glossário">
          {[40, 85, 70, 55].map((w, i) => (
            <div
              key={i}
              className="h-5 animate-pulse rounded bg-foreground/[0.06]"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      ) : glossary.isError ? (
        <p className="mt-10 text-destructive">
          Não deu para carregar o glossário. Recarregue a página para tentar de novo.
        </p>
      ) : total === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-serif text-2xl">Nenhum termo ainda</p>
          <p className="mx-auto mt-2 max-w-[48ch] text-sm text-muted-foreground">
            Os termos vêm da seção “Termos importantes” dos resumos. Gere o resumo de um tópico e
            ele aparece aqui.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted-foreground tnum" aria-live="polite">
            {entries.length === total
              ? `${total} termos de ${glossary.data?.topics ?? 0} tópicos`
              : `${entries.length} de ${total} termos`}
          </p>

          <nav
            aria-label="Letras"
            className="sticky top-0 z-10 -mx-1 mt-3 flex flex-wrap gap-0.5 border-b border-border bg-background/95 py-2 backdrop-blur"
          >
            {LETTERS.map((l) =>
              available.has(l) ? (
                <a
                  key={l}
                  href={`#letra-${l === "#" ? "outros" : l}`}
                  className="flex size-7 items-center justify-center rounded-md font-mono text-sm text-foreground transition-colors hover:bg-foreground/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {l}
                </a>
              ) : (
                <span
                  key={l}
                  aria-hidden
                  className="flex size-7 items-center justify-center font-mono text-sm text-muted-foreground/40"
                >
                  {l}
                </span>
              ),
            )}
          </nav>

          {!entries.length ? (
            <p className="mt-8 text-muted-foreground">
              Nenhum termo com “{q}”{modulo ? " nesta disciplina" : ""}.
            </p>
          ) : (
            groups.map((g) => (
              <section
                key={g.letter}
                id={`letra-${g.letter === "#" ? "outros" : g.letter}`}
                aria-labelledby={`titulo-${g.letter === "#" ? "outros" : g.letter}`}
                className="scroll-mt-16"
              >
                <h2
                  id={`titulo-${g.letter === "#" ? "outros" : g.letter}`}
                  className="mt-10 border-b-[1.5px] border-foreground pb-1 font-serif text-[2rem] leading-none"
                >
                  {g.letter === "#" ? "Números e símbolos" : g.letter}
                </h2>
                <dl className="divide-y divide-border">
                  {g.items.map((e) => (
                    <Entry key={e.key} entry={e} />
                  ))}
                </dl>
              </section>
            ))
          )}
        </>
      )}
    </main>
  );
}

function Entry({ entry }: { entry: GlossaryEntry }) {
  const [saving, setSaving] = useState(false);

  /** Cria um flashcard "O que é…?" no tópico da primeira definição. */
  async function toFlashcard() {
    const d = entry.definitions[0];
    if (!d) return;
    setSaving(true);
    try {
      const front = `O que é ${entry.term}?`;
      const { data: existing } = await supabase
        .from("flashcards")
        .select("id")
        .eq("topic_id", d.topicId)
        .eq("front", front)
        .limit(1)
        .maybeSingle();
      if (existing) {
        toast.info("Esse flashcard já existe nesse tópico.");
        return;
      }
      const { error } = await supabase
        .from("flashcards")
        .insert({ topic_id: d.topicId, front, back: d.text });
      if (error) throw new Error(error.message);
      toast.success(`Flashcard criado em “${cleanTitle(d.topicTitle) || d.topicTitle}”.`);
    } catch (e) {
      toast.error(`Não deu para criar o flashcard${e instanceof Error ? ` (${e.message})` : ""}.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="group grid gap-x-8 gap-y-1.5 py-4 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto]">
      <dt className="font-serif text-[1.3rem] leading-snug">{entry.term}</dt>
      <dd className="min-w-0">
        {entry.etymology && (
          <p className="mb-1 text-sm italic text-muted-foreground">{entry.etymology}</p>
        )}
        <ul className="space-y-2">
          {entry.definitions.map((d, i) => (
            <li key={i} className="text-[0.98rem] leading-relaxed">
              {d.text}{" "}
              <Link
                to="/topico/$id"
                params={{ id: d.topicId }}
                className="whitespace-nowrap text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground"
              >
                {cleanTitle(d.topicTitle) || d.topicTitle}
              </Link>
            </li>
          ))}
        </ul>
      </dd>
    </div>
  );
}
