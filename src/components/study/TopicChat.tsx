import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUp, MessageCircleQuestion, Trash2, X } from "lucide-react";
import { AiWait } from "@/components/study/AiWait";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { aiErrorMessage, withAiRetry } from "@/lib/ai-busy";
import { askTopic } from "@/lib/chat.functions";
import { parseAnswer } from "@/lib/chat-format";
import { cn } from "@/lib/utils";

type ChatRow = { id: string; role: "user" | "assistant"; content: string; created_at: string };

const SUGGESTIONS = [
  { short: "Resumir", text: "Resuma este tópico em 5 pontos." },
  { short: "O que cai em prova", text: "O que mais cai em prova sobre este tema?" },
  {
    short: "Treinar comigo",
    text: "Treino: me faça uma pergunta sobre este tópico, como numa prova oral, e corrija a minha resposta.",
  },
];

const eyebrow =
  "font-sans text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground";

/**
 * Botão "Perguntar" fixo no canto e painel lateral de conversa com o tópico.
 * O painel não bloqueia a página: dá para ler o resumo enquanto conversa.
 */
export function TopicChat({
  topicId,
  topicTitle,
  onGoToSection,
}: {
  topicId: string;
  topicTitle: string;
  onGoToSection: (title: string) => void;
}) {
  const queryClient = useQueryClient();
  const ask = useServerFn(askTopic);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; question: string } | null>(null);
  const [wait, setWait] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const panelId = useId();
  const titleId = useId();
  const inputId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);

  const messages = useQuery({
    queryKey: ["chat", topicId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topic_chat_messages")
        .select("id, role, content, created_at")
        .eq("topic_id", topicId)
        .order("created_at")
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ChatRow[];
    },
  });

  // Abriu: foco no campo. Fechou: foco volta para o botão que abriu
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // Rola até a última mensagem quando chega algo novo
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.data, pending, error, open]);

  function close() {
    setOpen(false);
    window.requestAnimationFrame(() => trigger.current?.focus());
  }

  async function send(question: string, resend = false) {
    const q = question.trim();
    if (q.length < 2 || pending) return;
    setError(null);
    setPending(q);
    setText("");
    if (input.current) input.current.style.height = "auto";
    try {
      await withAiRetry(
        () => ask({ data: { topic_id: topicId, question: q, resend } }),
        (s) => setWait(`A IA está congestionada. Tentando de novo em ${s} s…`),
      );
      await queryClient.invalidateQueries({ queryKey: ["chat", topicId] });
    } catch (e) {
      setError({ message: aiErrorMessage(e, "Não deu para responder agora."), question: q });
      // A pergunta já pode ter sido salva no servidor: recarrega para mostrar o que ficou
      await queryClient.invalidateQueries({ queryKey: ["chat", topicId] });
    } finally {
      setPending(null);
      setWait(null);
      input.current?.focus();
    }
  }

  async function clear() {
    const { error: delError } = await supabase
      .from("topic_chat_messages")
      .delete()
      .eq("topic_id", topicId);
    setConfirmClear(false);
    if (delError) {
      toast.error("Não deu para limpar a conversa.");
      return;
    }
    setError(null);
    await queryClient.invalidateQueries({ queryKey: ["chat", topicId] });
    input.current?.focus();
  }

  const rows = messages.data ?? [];
  const lastIsQuestion = rows.at(-1)?.role === "user";

  return (
    <>
      {!open && (
        <button
          ref={trigger}
          type="button"
          aria-expanded={false}
          aria-controls={panelId}
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium shadow-lift transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] motion-reduce:transition-none"
        >
          <MessageCircleQuestion className="size-4" aria-hidden />
          Perguntar
        </button>
      )}

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
          className="fixed inset-0 z-40 flex flex-col border-l border-border bg-background shadow-lift animate-in slide-in-from-right-8 fade-in-0 duration-200 motion-reduce:animate-none sm:inset-y-0 sm:left-auto sm:w-[420px]"
        >
          <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <p className={eyebrow}>Perguntar ao tópico</p>
              <h2 id={titleId} className="mt-0.5 truncate font-serif text-[1.35rem] leading-tight">
                {topicTitle}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {rows.length > 0 &&
                (confirmClear ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    autoFocus
                    onBlur={() => setConfirmClear(false)}
                    onClick={() => void clear()}
                  >
                    Limpar?
                  </Button>
                ) : (
                  <button
                    type="button"
                    aria-label="Limpar conversa"
                    title="Limpar conversa"
                    onClick={() => setConfirmClear(true)}
                    className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                ))}
              <button
                type="button"
                aria-label="Fechar"
                onClick={close}
                className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </header>

          <div
            ref={log}
            role="log"
            aria-live="polite"
            aria-label="Conversa"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4"
          >
            {messages.isLoading ? (
              <div className="space-y-3" aria-busy="true">
                {[70, 90, 50].map((w, i) => (
                  <div
                    key={i}
                    className="h-4 animate-pulse rounded bg-foreground/[0.06]"
                    style={{ width: `${w}%` }}
                  />
                ))}
              </div>
            ) : rows.length === 0 && !pending ? (
              <div className="pt-2">
                <p className="text-[0.95rem] text-muted-foreground">
                  Tire dúvidas sobre este tópico. As respostas usam o seu resumo e a aula, e dizem
                  de qual seção vieram.
                </p>
                <ul className="mt-4 grid gap-2">
                  {SUGGESTIONS.map((s) => (
                    <li key={s.text}>
                      <button
                        type="button"
                        onClick={() => void send(s.text)}
                        className="w-full rounded-lg border border-border px-3 py-2.5 text-left text-sm transition-colors hover:border-foreground/40 hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {s.text}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ol className="grid gap-5">
                {rows.map((m) => (
                  <Message
                    key={m.id}
                    row={m}
                    onGoToSection={(title) => {
                      // No celular o painel cobre a tela: fecha para mostrar o resumo
                      if (window.matchMedia("(max-width: 639px)").matches) setOpen(false);
                      onGoToSection(title);
                    }}
                  />
                ))}
                {pending && !lastIsQuestion && (
                  <li className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-foreground/[0.06] px-3 py-2 text-[0.95rem]">
                    {pending}
                  </li>
                )}
                {pending && (
                  <li>
                    <AiWait active label={wait ?? "Pensando…"} />
                  </li>
                )}
              </ol>
            )}
            {error && (
              <div className="mt-4 rounded-lg border border-destructive/40 px-3 py-2.5 text-sm">
                <p className="text-destructive">{error.message}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => void send(error.question, lastIsQuestion)}
                >
                  Tentar de novo
                </Button>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
            className="border-t border-border px-4 py-3"
          >
            {/* Atalhos sempre à mão (antes só apareciam com a conversa vazia) */}
            {rows.length > 0 && (
              <div role="group" aria-label="Atalhos" className="mb-2 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.short}
                    type="button"
                    disabled={!!pending}
                    title={s.text}
                    onClick={() => void send(s.text)}
                    className="h-7 shrink-0 rounded-full border border-border px-3 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                  >
                    {s.short}
                  </button>
                ))}
              </div>
            )}
            <label htmlFor={inputId} className="sr-only">
              Sua pergunta
            </label>
            <div className="flex items-end gap-2 rounded-lg border border-input bg-card px-3 py-2 focus-within:border-ring focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-ring)_18%,transparent)]">
              <textarea
                id={inputId}
                ref={input}
                value={text}
                rows={1}
                maxLength={2000}
                placeholder="Pergunte algo sobre o tópico…"
                onChange={(e) => {
                  setText(e.target.value);
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(text);
                  }
                }}
                className="max-h-36 min-h-6 flex-1 resize-none bg-transparent text-[0.95rem] leading-6 outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                aria-label="Enviar pergunta"
                disabled={!!pending || text.trim().length < 2}
                className="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground text-background transition-[transform,opacity] active:scale-[0.94] disabled:opacity-30"
              >
                <ArrowUp className="size-4" aria-hidden />
              </button>
            </div>
            <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
              Enter envia · Shift+Enter quebra a linha
            </p>
          </form>
        </div>
      )}
    </>
  );
}

function Message({ row, onGoToSection }: { row: ChatRow; onGoToSection: (title: string) => void }) {
  if (row.role === "user") {
    return (
      <li className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-foreground/[0.06] px-3 py-2 text-[0.95rem]">
        <span className="sr-only">Você: </span>
        {row.content}
      </li>
    );
  }
  const { html, sections } = parseAnswer(row.content);
  return (
    <li>
      <span className="sr-only">Tutor: </span>
      <div
        className={cn(
          "resumo-editor prose-study overflow-x-auto text-[0.95rem]",
          "[&>:last-child]:mb-0",
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {sections.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">No resumo:</span>
          {sections.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onGoToSection(s)}
              title={`Ir para “${s}” no resumo`}
              className="max-w-full truncate rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
