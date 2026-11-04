import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Notas na margem do resumo. Cada nota fica presa a um bloco (parágrafo, lista,
 * tabela…) pelo índice e pelo começo do texto do bloco: se o resumo mudar (tabela
 * inserida, edição), a nota procura o bloco pelo texto e continua no lugar certo.
 */

export type NoteRow = {
  id: string;
  topic_id: string;
  block_index: number;
  anchor_text: string | null;
  content: string;
  updated_at: string;
};

const ANCHOR_LEN = 120;

export const normalizeBlockText = (text: string) =>
  text.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");

/** O começo do texto do bloco, que serve de âncora da nota. */
export const anchorOf = (blockText: string) => normalizeBlockText(blockText).slice(0, ANCHOR_LEN);

export type ResolvedNotes = {
  /** índice do bloco → notas daquele bloco */
  byBlock: Map<number, NoteRow[]>;
  /** notas cujo trecho não existe mais (resumo refeito, por exemplo) */
  orphans: NoteRow[];
};

/**
 * Acha o bloco de cada nota: primeiro pelo texto (o bloco mais perto do índice
 * antigo que começa igual), depois pelo índice, se o texto estiver vazio.
 */
export function resolveNotes(notes: NoteRow[], blockTexts: string[]): ResolvedNotes {
  const anchors = blockTexts.map(anchorOf);
  const byBlock = new Map<number, NoteRow[]>();
  const orphans: NoteRow[] = [];
  for (const note of notes) {
    let at = -1;
    if (note.anchor_text) {
      let best = Infinity;
      anchors.forEach((a, i) => {
        if (a && (a === note.anchor_text || a.startsWith(note.anchor_text!))) {
          const d = Math.abs(i - note.block_index);
          if (d < best) {
            best = d;
            at = i;
          }
        }
      });
    } else if (note.block_index < blockTexts.length) {
      at = note.block_index;
    }
    if (at < 0) orphans.push(note);
    else (byBlock.get(at) ?? byBlock.set(at, []).get(at)!).push(note);
  }
  return { byBlock, orphans };
}

/** Erro de coluna "anchor_text" inexistente: o SQL da Etapa 9 ainda não rodou no banco. */
const missingAnchor = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST204" || e.code === "42703") && /anchor_text/.test(e.message ?? "");

/** Mensagem com o motivo real, para dar para entender o que falhou. */
const failure = (what: string, e: { message?: string } | null) =>
  new Error(`Não deu para ${what}${e?.message ? ` (${e.message})` : ""}.`);

export function useNotes(topicId: string) {
  return useQuery({
    queryKey: ["notes", topicId],
    queryFn: async () => {
      const base = () => supabase.from("topic_notes").select("*").eq("topic_id", topicId);
      const { data, error } = await base().order("created_at");
      if (error) throw failure("carregar as notas", error);
      // Sem a coluna nova, as notas ficam presas só pelo índice do bloco
      return ((data ?? []) as Partial<NoteRow>[]).map((n) => ({
        ...n,
        anchor_text: n.anchor_text ?? null,
      })) as NoteRow[];
    },
  });
}

export function useNoteActions(topicId: string) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notes", topicId] });

  const create = useMutation({
    mutationFn: async (v: { blockIndex: number; blockText: string; content: string }) => {
      const row = {
        topic_id: topicId,
        block_index: v.blockIndex,
        content: v.content.trim().slice(0, 5000),
      };
      let { error } = await supabase
        .from("topic_notes")
        .insert({ ...row, anchor_text: anchorOf(v.blockText) || null });
      if (missingAnchor(error)) {
        // Banco ainda sem a coluna nova: salva assim mesmo, presa só pelo índice
        console.warn("topic_notes sem anchor_text: rode docs/sql/etapa-9-notas.sql");
        ({ error } = await supabase.from("topic_notes").insert(row));
      }
      if (error) throw failure("salvar a nota", error);
    },
    onSuccess: refresh,
  });

  const update = useMutation({
    mutationFn: async (v: { id: string; content: string }) => {
      const { error } = await supabase
        .from("topic_notes")
        .update({ content: v.content.trim().slice(0, 5000), updated_at: new Date().toISOString() })
        .eq("id", v.id);
      if (error) throw failure("salvar a nota", error);
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("topic_notes").delete().eq("id", id);
      if (error) throw failure("apagar a nota", error);
    },
    onSuccess: refresh,
  });

  return { create, update, remove };
}
