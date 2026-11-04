import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AiWait } from "@/components/study/AiWait";
import { supabase } from "@/integrations/supabase/client";
import { aiErrorMessage, withAiRetry } from "@/lib/ai-busy";
import { cn } from "@/lib/utils";
import { displayInitial, phraseParts, type Mnemonic } from "@/lib/mnemonics";
import { generateMnemonics } from "@/lib/summary-tools.functions";

const eyebrow =
  "font-sans text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground";

/** A frase com a inicial de cada palavra-chave sublinhada; a sigla, inteira. */
function MnemonicText({ m }: { m: Mnemonic }) {
  if (m.tipo === "frase" && m.chaves?.length) {
    return (
      <p className="mt-1.5 font-serif text-[1.4rem] leading-snug">
        <span className="grifo">
          {phraseParts(m.mnemonico, m.chaves).map((p, i) =>
            p.key ? (
              <span key={i} className="underline decoration-2 underline-offset-[3px]">
                {p.text}
              </span>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </span>
      </p>
    );
  }
  return (
    <p className="mt-1.5 font-serif text-[1.65rem] leading-tight">
      <span className="grifo">{m.mnemonico}</span>
    </p>
  );
}

/** Mnemônicos do tópico (aba Revisão). Gerar de novo substitui a lista. */
export function MnemonicsPanel({ topicId }: { topicId: string }) {
  const queryClient = useQueryClient();
  const generate = useServerFn(generateMnemonics);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["mnemonics", topicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("content")
        .eq("topic_id", topicId)
        .eq("type", "mnemonics")
        .maybeSingle();
      if (error) throw error;
      return ((data?.content as { items?: Mnemonic[] } | null)?.items ?? []) as Mnemonic[];
    },
  });

  async function run() {
    setBusy(true);
    try {
      await withAiRetry(
        () => generate({ data: { topic_id: topicId } }),
        (wait) =>
          toast.loading(`A IA está congestionada. Tentando de novo em ${wait} s…`, {
            id: "mnemonicos-espera",
          }),
      );
      await queryClient.invalidateQueries({ queryKey: ["mnemonics", topicId] });
      toast.success("Mnemônicos prontos.");
    } catch (e) {
      toast.error(aiErrorMessage(e, "Não deu para criar os mnemônicos."));
    } finally {
      toast.dismiss("mnemonicos-espera");
      setBusy(false);
    }
  }

  const items = q.data ?? [];

  return (
    <section aria-labelledby="mnemonicos" className="mb-10">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-[1.5px] border-foreground pb-2">
        <h2 id="mnemonicos" className="text-[1.75rem] leading-none">
          Mnemônicos
        </h2>
        {items.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => void run()} disabled={busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="size-4" aria-hidden />
            )}
            {busy ? "Criando…" : "Criar outros"}
          </Button>
        )}
      </div>
      <AiWait active={busy} label="Criando os mnemônicos" className="mt-3" />

      {q.isLoading ? (
        <div
          className="mt-4 h-5 w-2/3 animate-pulse rounded bg-foreground/[0.06]"
          aria-busy="true"
        />
      ) : !items.length ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-dashed border-border px-5 py-4">
          <p className="max-w-[52ch] text-sm text-muted-foreground">
            Siglas e frases para lembrar as listas e classificações deste tópico. Quando existe um
            mnemônico clássico, a IA usa o clássico.
          </p>
          <Button size="sm" onClick={() => void run()} disabled={busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            {busy ? "Criando…" : "Criar mnemônicos"}
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((m, i) => (
            <li
              key={i}
              className="grid gap-x-8 gap-y-2 py-5 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]"
            >
              <div>
                <p className={eyebrow}>
                  {m.lista}
                  {m.classico ? " · clássico" : ""}
                </p>
                <MnemonicText m={m} />
              </div>
              <div>
                <ol className="space-y-1 text-[0.98rem] leading-relaxed">
                  {m.itens.map((it, j) => {
                    const letter = m.tipo === "sigla" || m.tipo === "frase";
                    return (
                      <li key={j} className="flex items-baseline gap-2.5">
                        <span
                          className={cn(
                            "w-5 shrink-0 text-right font-mono tnum",
                            letter
                              ? "text-sm font-semibold text-foreground"
                              : "text-xs text-muted-foreground",
                          )}
                          aria-hidden={letter}
                        >
                          {letter ? displayInitial(it) : j + 1}
                        </span>
                        <span>{it}</span>
                      </li>
                    );
                  })}
                </ol>
                {m.explicacao && (
                  <p className="mt-2 text-sm text-muted-foreground">{m.explicacao}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
