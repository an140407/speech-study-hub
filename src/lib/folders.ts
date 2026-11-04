import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TopicListItem } from "@/lib/topics-index";

/**
 * Pastas do caderno em dois níveis: Disciplina (sem pai) › Unidade (dentro de uma disciplina).
 * Um tópico pode ficar numa disciplina, numa unidade ou em "Sem pasta". O banco garante os
 * dois níveis e que cada pessoa só mexe nas próprias pastas.
 */

export type Folder = {
  id: string;
  name: string;
  parent_id: string | null;
  position: number;
  created_at: string;
};

export type ProblemNode = { folder: Folder; topics: TopicListItem[] };
export type ModuleNode = {
  folder: Folder;
  problems: ProblemNode[];
  topics: TopicListItem[];
  count: number;
};
export type FolderTree = { modules: ModuleNode[]; loose: TopicListItem[] };

const byPosition = (a: Folder, b: Folder) =>
  a.position - b.position || a.name.localeCompare(b.name, "pt-BR", { numeric: true });

export function useFolders() {
  return useQuery({
    queryKey: ["folders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("folders")
        .select("id, name, parent_id, position, created_at");
      if (error) throw error;
      return (data as Folder[]).sort(byPosition);
    },
  });
}

/** Monta a árvore Disciplina › Unidade › tópicos. Tópico com pasta que não existe mais vai para "Sem pasta". */
export function buildFolderTree(folders: Folder[], topics: TopicListItem[]): FolderTree {
  const modules = folders.filter((f) => !f.parent_id);
  const byFolder = new Map<string, TopicListItem[]>();
  const known = new Set(folders.map((f) => f.id));
  const loose: TopicListItem[] = [];
  for (const t of topics) {
    if (t.folder_id && known.has(t.folder_id)) {
      const list = byFolder.get(t.folder_id) ?? [];
      list.push(t);
      byFolder.set(t.folder_id, list);
    } else {
      loose.push(t);
    }
  }
  return {
    modules: modules.map((m) => {
      const problems = folders
        .filter((f) => f.parent_id === m.id)
        .map((p) => ({ folder: p, topics: byFolder.get(p.id) ?? [] }));
      const direct = byFolder.get(m.id) ?? [];
      return {
        folder: m,
        problems,
        topics: direct,
        count: direct.length + problems.reduce((n, p) => n + p.topics.length, 0),
      };
    }),
    loose,
  };
}

/** "Audiologia Clínica › Unidade 2" para mostrar onde o tópico está. */
export function folderPath(folders: Folder[] | undefined, folderId: string | null): string | null {
  if (!folders || !folderId) return null;
  const f = folders.find((x) => x.id === folderId);
  if (!f) return null;
  const parent = f.parent_id ? folders.find((x) => x.id === f.parent_id) : null;
  return parent ? `${parent.name} › ${f.name}` : f.name;
}

/** Ações de pasta. Cada uma atualiza a lista de pastas e de tópicos ao terminar. */
export function useFolderActions() {
  const queryClient = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["folders"] }),
      queryClient.invalidateQueries({ queryKey: ["topics"] }),
    ]);
  };

  return {
    async create(name: string, parentId: string | null) {
      // Nova pasta entra no fim da lista do mesmo nível.
      const siblings = (queryClient.getQueryData<Folder[]>(["folders"]) ?? []).filter(
        (f) => f.parent_id === parentId,
      );
      const position = Math.max(-1, ...siblings.map((f) => f.position)) + 1;
      const { data, error } = await supabase
        .from("folders")
        .insert({ name: name.trim(), parent_id: parentId, position })
        .select("id")
        .single();
      if (error) throw new Error(friendly(error.message));
      await refresh();
      return data.id as string;
    },
    async rename(id: string, name: string) {
      const { error } = await supabase.from("folders").update({ name: name.trim() }).eq("id", id);
      if (error) throw new Error(friendly(error.message));
      await refresh();
    },
    async remove(id: string) {
      const { error } = await supabase.from("folders").delete().eq("id", id);
      if (error) throw new Error(friendly(error.message));
      await refresh();
    },
    async moveTopic(topicId: string, folderId: string | null) {
      const { error } = await supabase
        .from("topics")
        .update({ folder_id: folderId })
        .eq("id", topicId);
      if (error) throw new Error(friendly(error.message));
      await refresh();
    },
  };
}

function friendly(message: string) {
  if (/check constraint|violates check/i.test(message))
    return "O nome precisa ter de 1 a 80 caracteres.";
  return message;
}
