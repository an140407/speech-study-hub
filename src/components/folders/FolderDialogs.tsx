import { useEffect, useId, useState } from "react";
import { FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useFolderActions, useFolders, type Folder } from "@/lib/folders";

const inputClass =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-[0.9375rem] outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-ring)_18%,transparent)]";

/** Criar ou renomear uma pasta (disciplina ou unidade). */
export function FolderNameDialog({
  open,
  onOpenChange,
  title,
  description,
  initialName = "",
  placeholder,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  initialName?: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const inputId = useId();

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    setSaving(true);
    try {
      await onSubmit(clean);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não deu para salvar a pasta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-[1.6rem] font-normal leading-none">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <label htmlFor={inputId} className="sr-only">
            Nome
          </label>
          <input
            id={inputId}
            autoFocus
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder}
            className={cn(inputClass, "mt-5")}
          />
          <DialogFooter className="mt-5 gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Salvando…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Confirma a exclusão de uma pasta. Nenhum tópico é apagado: eles voltam para "Sem pasta". */
export function DeleteFolderDialog({
  folder,
  topicCount,
  problemCount,
  onOpenChange,
}: {
  folder: Folder | null;
  topicCount: number;
  problemCount: number;
  onOpenChange: (open: boolean) => void;
}) {
  const { remove } = useFolderActions();
  const [deleting, setDeleting] = useState(false);
  const isModule = !!folder && !folder.parent_id;

  async function confirm() {
    if (!folder) return;
    setDeleting(true);
    try {
      await remove(folder.id);
      toast.success(`Pasta “${folder.name}” excluída.`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não deu para excluir a pasta.");
    } finally {
      setDeleting(false);
    }
  }

  const topicsText =
    topicCount === 0
      ? "Ela está vazia."
      : `${topicCount === 1 ? "O tópico" : `Os ${topicCount} tópicos`} de dentro ${topicCount === 1 ? "volta" : "voltam"} para “Sem pasta”; nenhum material é apagado.`;

  return (
    <AlertDialog open={!!folder} onOpenChange={(o) => !deleting && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir “{folder?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {isModule && problemCount > 0
              ? `${problemCount === 1 ? "A unidade" : `As ${problemCount} unidades`} dentro desta disciplina também ${problemCount === 1 ? "é excluída" : "são excluídas"}. `
              : ""}
            {topicsText}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? "Excluindo…" : "Excluir pasta"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Escolhe a pasta de um tópico. Rádios nativos: setas do teclado navegam entre os destinos. */
export function MoveTopicDialog({
  topic,
  onOpenChange,
}: {
  topic: { id: string; title: string; folder_id: string | null } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const folders = useFolders();
  const { moveTopic, create } = useFolderActions();
  const [target, setTarget] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [newModule, setNewModule] = useState("");
  const name = useId();
  const newId = useId();

  useEffect(() => {
    if (topic) {
      setTarget(topic.folder_id ?? "");
      setNewModule("");
    }
  }, [topic]);

  const list = folders.data ?? [];
  const modules = list.filter((f) => !f.parent_id);

  async function save() {
    if (!topic) return;
    setSaving(true);
    try {
      let dest = target || null;
      if (newModule.trim()) dest = await create(newModule, null);
      await moveTopic(topic.id, dest);
      toast.success(dest ? "Tópico movido." : "Tópico movido para “Sem pasta”.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não deu para mover o tópico.");
    } finally {
      setSaving(false);
    }
  }

  const option = (value: string, label: string, sub = false) => (
    <label
      key={value || "sem-pasta"}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 text-[0.9375rem] transition-colors hover:bg-accent",
        sub && "pl-9",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={target === value && !newModule.trim()}
        onChange={() => {
          setTarget(value);
          setNewModule("");
        }}
        className="size-4 accent-[var(--color-foreground)]"
      />
      <span className={cn("truncate", !value && "text-muted-foreground")}>{label}</span>
    </label>
  );

  return (
    <Dialog open={!!topic} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-[1.6rem] font-normal leading-none">Mover para pasta</DialogTitle>
          <DialogDescription className="line-clamp-2">{topic?.title}</DialogDescription>
        </DialogHeader>

        <fieldset className="mt-3">
          <legend className="sr-only">Destino</legend>
          <div className="-mx-3 max-h-[46vh] overflow-y-auto">
            {option("", "Sem pasta")}
            {modules.map((m) => (
              <div key={m.id}>
                {option(m.id, m.name)}
                {list.filter((p) => p.parent_id === m.id).map((p) => option(p.id, p.name, true))}
              </div>
            ))}
          </div>
        </fieldset>

        <div className="mt-3 border-t border-border pt-4">
          <label htmlFor={newId} className="flex items-center gap-2 text-sm text-muted-foreground">
            <FolderPlus className="size-4" aria-hidden />
            {modules.length
              ? "Ou crie uma disciplina nova e mova para ela"
              : "Você ainda não tem pastas: crie uma disciplina"}
          </label>
          <input
            id={newId}
            value={newModule}
            maxLength={80}
            onChange={(e) => setNewModule(e.target.value)}
            placeholder="Ex.: 6MOD221 Patologia Geral"
            className={cn(inputClass, "mt-2")}
          />
        </div>

        <DialogFooter className="mt-5 gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Movendo…" : "Mover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
