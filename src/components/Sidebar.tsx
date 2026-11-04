import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { BookA, BookX, ChartNoAxesColumn, ChevronRight, Ellipsis, FolderPlus, GraduationCap, LogOut, NotebookPen, Plus, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BrandMark, Wordmark } from "@/components/BrandMark";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { DeleteFolderDialog, FolderNameDialog } from "@/components/folders/FolderDialogs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildFolderTree, useFolderActions, useFolders, type Folder } from "@/lib/folders";
import type { TopicListItem } from "@/lib/topics-index";
import { computeMistakes, useAttempts } from "@/lib/attempts";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cleanTitle, progressPct, useTopicsList, useTopicsProgress } from "@/lib/topics-index";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Casca do app logado (proposta Caderno):
 * - PC (≥1024 px): barra lateral fixa com navegação e o índice de tópicos.
 * - Tablet e celular: barra no topo com o botão "Índice", que abre a mesma barra numa gaveta.
 */
/** Foca o campo de novo tópico assim que ele existir na tela (espera a navegação terminar). */
function focusWhenReady(id: string, tries = 60) {
  const el = document.getElementById(id);
  if (el) {
    el.focus();
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  if (tries > 0) window.requestAnimationFrame(() => focusWhenReady(id, tries - 1));
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // "Novo tópico" clicado dentro da gaveta: depois que ela fechar, o foco vai para o campo
  const focusAfterClose = useRef(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Fecha a gaveta ao trocar de página
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-[100dvh]">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>

      <aside
        aria-label="Navegação"
        className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-sidebar-border bg-sidebar lg:flex"
      >
        <SidebarContent pathname={pathname} />
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-md"
          aria-label="FonoLab, ir para os tópicos"
        >
          <BrandMark className="size-7" />
          <Wordmark className="text-[1.5rem]" />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="gaveta-indice"
          className="-mr-2 flex h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <NotebookPen className="size-[18px]" aria-hidden />
          Índice
        </button>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          id="gaveta-indice"
          side="left"
          className="flex w-[300px] max-w-[85vw] bg-sidebar p-0 sm:max-w-[300px]"
          onCloseAutoFocus={(e) => {
            if (!focusAfterClose.current) return;
            e.preventDefault();
            focusAfterClose.current = false;
            focusWhenReady("novo-topico");
          }}
        >
          <SheetTitle className="sr-only">Índice</SheetTitle>
          <SheetDescription className="sr-only">Navegação e lista de tópicos</SheetDescription>
          <SidebarContent
            pathname={pathname}
            onNewTopic={() => {
              focusAfterClose.current = true;
              setOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>

      <div id="conteudo" tabIndex={-1} className="outline-none lg:pl-[264px]">
        {children}
      </div>
    </div>
  );
}

function SidebarContent({ pathname, onNewTopic }: { pathname: string; onNewTopic?: () => void }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const topics = useTopicsList();
  const progress = useTopicsProgress();
  const folders = useFolders();
  const attempts = useAttempts();
  const pendingMistakes = useMemo(() => computeMistakes(attempts.data ?? []).pending.length, [attempts.data]);
  const { create, rename, moveTopic } = useFolderActions();
  // Arrastar tópico para uma pasta (no computador). No celular/teclado: "⋯ → Mover para pasta".
  const [dragging, setDragging] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const expandTimer = useRef<number | null>(null);
  const [filter, setFilter] = useState("");
  const [nameDialog, setNameDialog] = useState<
    { mode: "modulo" } | { mode: "problema"; parent: Folder } | { mode: "renomear"; folder: Folder } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<{ folder: Folder; topics: number; problems: number } | null>(
    null,
  );
  const collapsed = useCollapsedFolders();
  const uid = useId();
  const headingId = `${uid}-indice`;
  const filterId = `${uid}-filtro`;

  const list = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase("pt-BR");
    return (topics.data ?? [])
      .map((t) => ({ ...t, label: cleanTitle(t.title) }))
      .filter(
        (t) =>
          !q ||
          t.label
            .replace(/\u00A0/g, " ")
            .toLocaleLowerCase("pt-BR")
            .includes(q),
      );
  }, [topics.data, filter]);

  const tree = useMemo(
    () => buildFolderTree(folders.data ?? [], topics.data ?? []),
    [folders.data, topics.data],
  );
  const hasFolders = (folders.data?.length ?? 0) > 0;
  const activeTopicId = pathname.startsWith("/topico/") ? pathname.slice("/topico/".length) : null;
  const activeFolderId = topics.data?.find((t) => t.id === activeTopicId)?.folder_id ?? null;
  const activeParentId = folders.data?.find((f) => f.id === activeFolderId)?.parent_id ?? null;
  const isOpen = (id: string) => !collapsed.has(id);

  // Enquanto arrasta, soltar fora de uma pasta não abre o link do tópico numa aba nova.
  useEffect(() => {
    if (!dragging) return;
    const block = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes(TOPIC_MIME)) e.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, [dragging]);

  function stopDrag() {
    setDragging(false);
    setDragOver(null);
    if (expandTimer.current) window.clearTimeout(expandTimer.current);
    expandTimer.current = null;
  }

  /** Torna uma área (pasta ou "Sem pasta") um destino para soltar tópicos. */
  function dropTarget(key: string, folderId: string | null, label: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(TOPIC_MIME)) return;
        e.preventDefault();
        e.stopPropagation(); // a pasta mais interna (unidade) ganha da de fora (disciplina)
        e.dataTransfer.dropEffect = "move";
        if (dragOver !== key) {
          setDragOver(key);
          if (expandTimer.current) window.clearTimeout(expandTimer.current);
          expandTimer.current = null;
          // Pasta fechada abre sozinha se o tópico ficar parado em cima dela.
          if (folderId && collapsed.has(folderId)) {
            expandTimer.current = window.setTimeout(() => collapsed.toggle(folderId), 650);
          }
        }
      },
      onDragLeave: (e: React.DragEvent) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragOver((k) => (k === key ? null : k));
      },
      onDrop: async (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(TOPIC_MIME)) return;
        e.preventDefault();
        e.stopPropagation();
        const topicId = e.dataTransfer.getData(TOPIC_MIME);
        stopDrag();
        const topic = topics.data?.find((t) => t.id === topicId);
        if (!topic || topic.folder_id === folderId) return;
        try {
          await moveTopic(topicId, folderId);
          toast.success(folderId ? `Movido para “${label}”.` : "Movido para “Sem pasta”.");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Não deu para mover o tópico.");
        }
      },
    };
  }
  // Ao abrir um tópico, a pasta dele (e a disciplina acima) se abrem para ele aparecer no índice.
  const { expand } = collapsed;
  useEffect(() => {
    expand([activeFolderId, activeParentId]);
  }, [activeFolderId, activeParentId, expand]);

  function renderTopic(t: TopicListItem & { label?: string }) {
    const label = t.label ?? cleanTitle(t.title);
    const active = pathname === `/topico/${t.id}`;
    const pct = progressPct(progress.data?.byTopic[t.id]);
    return (
      <li key={t.id}>
        <Link
          to="/topico/$id"
          params={{ id: t.id }}
          title={label}
          aria-current={active ? "page" : undefined}
          draggable={hasFolders}
          onDragStart={(e) => {
            if (!hasFolders) return;
            e.dataTransfer.setData(TOPIC_MIME, t.id);
            e.dataTransfer.effectAllowed = "move";
            setDragging(true);
          }}
          onDragEnd={stopDrag}
          className={cn(
            "flex min-h-9 items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-sm transition-colors",
            dragging && "cursor-grabbing",
            active
              ? "bg-sidebar-accent text-foreground shadow-[0_0_0_1px_var(--color-sidebar-border)]"
              : "text-foreground/80 hover:bg-sidebar-accent/70 hover:text-foreground",
          )}
        >
          <span className="truncate">{label}</span>
          <span className="shrink-0 text-xs text-muted-foreground tnum">{pct}%</span>
        </Link>
      </li>
    );
  }

  function folderRow(folder: Folder, count: number, problems: number, isModule: boolean) {
    const open = isOpen(folder.id);
    return (
      <div
        {...dropTarget(folder.id, folder.id, folder.name)}
        className={cn(
          "group/pasta flex items-center rounded-md transition-[background-color,box-shadow] hover:bg-sidebar-accent/70",
          dragOver === folder.id && "bg-sidebar-accent shadow-[0_0_0_1.5px_var(--color-ring)]",
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => collapsed.toggle(folder.id)}
          className={cn(
            "flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded-md py-1.5 pl-1.5 text-left",
            isModule ? "text-[0.8125rem] font-medium text-foreground" : "text-sm text-foreground/85",
          )}
        >
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out",
              open && "rotate-90",
            )}
            aria-hidden
          />
          <span className="truncate">{folder.name}</span>
          <span className="ml-auto shrink-0 pl-2 text-xs font-normal text-muted-foreground tnum">
            <span className="sr-only">, </span>
            {count}
            <span className="sr-only"> {count === 1 ? "tópico" : "tópicos"}</span>
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Ações da pasta ${folder.name}`}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[opacity,color,background-color] hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100 lg:opacity-0 lg:group-hover/pasta:opacity-100"
            >
              <Ellipsis className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {isModule && (
              <DropdownMenuItem onSelect={() => setNameDialog({ mode: "problema", parent: folder })}>
                Nova unidade
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setNameDialog({ mode: "renomear", folder })}>
              Renomear
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setDeleteTarget({ folder, topics: count, problems })}
              className="text-destructive focus:text-destructive"
            >
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  const name = (user?.user_metadata?.["full_name"] as string | undefined) ?? user?.email ?? "";
  const firstName = name.split(/[\s@]/)[0] ?? "";
  const initials =
    name
      .split(/[\s@.]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";

  function newTopic() {
    // Na gaveta, quem foca o campo é a própria gaveta depois de fechar (senão ela devolve o foco a si mesma)
    onNewTopic?.();
    void navigate({ to: "/" }).then(() => {
      if (!onNewTopic) focusWhenReady("novo-topico");
    });
  }

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth" });
  }

  const navItem = (active: boolean) =>
    cn(
      "flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[0.9375rem] transition-colors",
      active
        ? "bg-sidebar-accent font-medium text-foreground shadow-[0_0_0_1px_var(--color-sidebar-border)]"
        : "text-foreground/80 hover:bg-sidebar-accent/70 hover:text-foreground",
    );

  return (
    <div className="flex h-full w-full flex-col gap-5 px-4 pb-3 pt-5">
      <Link
        to="/"
        className="flex items-center gap-2.5 self-start rounded-md px-1.5"
        aria-label="FonoLab, ir para os tópicos"
      >
        <BrandMark className="size-8" />
        <Wordmark />
      </Link>

      <button
        type="button"
        onClick={newTopic}
        className="flex h-10 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-[background-color,transform] hover:bg-primary/85 active:scale-[0.98]"
      >
        <Plus className="size-4" aria-hidden strokeWidth={2.4} />
        Novo tópico
      </button>

      <nav aria-label="Seções" className="flex flex-col gap-0.5">
        <Link
          to="/"
          className={navItem(pathname === "/")}
          aria-current={pathname === "/" ? "page" : undefined}
        >
          <NotebookPen className="size-[18px]" aria-hidden />
          Tópicos
        </Link>
        <Link
          to="/prova"
          className={navItem(pathname.startsWith("/prova"))}
          aria-current={pathname.startsWith("/prova") ? "page" : undefined}
        >
          <GraduationCap className="size-[18px]" aria-hidden />
          Modo Prova
        </Link>
        <Link
          to="/erros"
          className={navItem(pathname.startsWith("/erros"))}
          aria-current={pathname.startsWith("/erros") ? "page" : undefined}
        >
          <BookX className="size-[18px]" aria-hidden />
          Caderno de erros
          {pendingMistakes > 0 && (
            <span className="ml-auto rounded-full bg-tint-3 px-2 py-0.5 text-xs font-medium text-tint-3-fg tnum">
              <span className="sr-only">, </span>
              {pendingMistakes}
              <span className="sr-only"> para revisar</span>
            </span>
          )}
        </Link>
        <Link
          to="/glossario"
          className={navItem(pathname.startsWith("/glossario"))}
          aria-current={pathname.startsWith("/glossario") ? "page" : undefined}
        >
          <BookA className="size-[18px]" aria-hidden />
          Glossário
        </Link>
        <Link
          to="/estatisticas"
          className={navItem(pathname.startsWith("/estatisticas"))}
          aria-current={pathname.startsWith("/estatisticas") ? "page" : undefined}
        >
          <ChartNoAxesColumn className="size-[18px]" aria-hidden />
          Desempenho
        </Link>
      </nav>

      <section aria-labelledby={headingId} className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between px-2.5 pb-2">
          <h2
            id={headingId}
            className="font-sans text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground"
          >
            Índice
          </h2>
          <div className="flex items-center gap-1">
            {!!topics.data?.length && (
              <span className="text-xs text-muted-foreground tnum">{topics.data.length}</span>
            )}
            <button
              type="button"
              onClick={() => setNameDialog({ mode: "modulo" })}
              aria-label="Nova disciplina"
              title="Nova disciplina"
              className="-mr-1.5 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              <FolderPlus className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        {(topics.data?.length ?? 0) > 6 && (
          <div className="relative mb-2">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <label htmlFor={filterId} className="sr-only">
              Filtrar tópicos
            </label>
            <input
              id={filterId}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar tópicos…"
              className="h-9 w-full rounded-md border border-sidebar-border bg-sidebar-accent/60 pl-8 pr-2 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:bg-sidebar-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-ring)_18%,transparent)]"
            />
          </div>
        )}

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {topics.isLoading ? (
            <ul className="space-y-1" aria-hidden>
              {[70, 85, 60, 78].map((w, i) => (
                <li key={i} className="h-8 rounded-md px-2.5 py-2">
                  <div className="h-3.5 rounded bg-foreground/[0.06]" style={{ width: `${w}%` }} />
                </li>
              ))}
            </ul>
          ) : !list.length ? (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">
              {filter ? "Nenhum tópico com esse nome." : "Seus tópicos aparecem aqui."}
            </p>
          ) : filter || !hasFolders ? (
            <ul className="space-y-0.5">{list.map((t) => renderTopic(t))}</ul>
          ) : (
            <div className="space-y-1">
              {tree.modules.map((m) => (
                <div key={m.folder.id}>
                  {folderRow(m.folder, m.count, m.problems.length, true)}
                  {isOpen(m.folder.id) && (
                    <div
                      {...dropTarget(m.folder.id, m.folder.id, m.folder.name)}
                      className="ml-[0.8125rem] space-y-0.5 border-l border-sidebar-border pl-1.5"
                    >
                      {m.problems.map((p) => (
                        <div key={p.folder.id}>
                          {folderRow(p.folder, p.topics.length, 0, false)}
                          {isOpen(p.folder.id) && (
                            <ul
                              {...dropTarget(p.folder.id, p.folder.id, p.folder.name)}
                              className="ml-[0.8125rem] space-y-0.5 border-l border-sidebar-border pl-1.5"
                            >
                              {p.topics.length ? (
                                p.topics.map((t) => renderTopic(t))
                              ) : (
                                <li className="px-2.5 py-1.5 text-xs text-muted-foreground">Nenhum tópico</li>
                              )}
                            </ul>
                          )}
                        </div>
                      ))}
                      {!!m.topics.length && <ul className="space-y-0.5">{m.topics.map((t) => renderTopic(t))}</ul>}
                      {!m.problems.length && !m.topics.length && (
                        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
                          Vazio. Use “⋯ → Nova unidade” ou mova um tópico para cá.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {(!!tree.loose.length || dragging) && (
                <div
                  {...dropTarget("sem-pasta", null, "Sem pasta")}
                  className={cn(
                    "mt-2 rounded-md pt-2 transition-[background-color,box-shadow]",
                    dragOver === "sem-pasta" && "bg-sidebar-accent shadow-[0_0_0_1.5px_var(--color-ring)]",
                  )}
                >
                  <p className="px-2.5 pb-1 font-sans text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Sem pasta
                  </p>
                  {tree.loose.length ? (
                    <ul className="space-y-0.5">{tree.loose.map((t) => renderTopic(t))}</ul>
                  ) : (
                    <p className="mx-2.5 mb-2 rounded-md border border-dashed border-sidebar-border px-2.5 py-2 text-xs text-muted-foreground">
                      Solte aqui para tirar da pasta
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <FolderNameDialog
        open={!!nameDialog}
        onOpenChange={(o) => !o && setNameDialog(null)}
        title={
          nameDialog?.mode === "renomear"
            ? "Renomear pasta"
            : nameDialog?.mode === "problema"
              ? "Nova unidade"
              : "Nova disciplina"
        }
        description={
          nameDialog?.mode === "problema"
            ? `Dentro de “${nameDialog.parent.name}”.`
            : nameDialog?.mode === "renomear"
              ? "O nome aparece no índice e no Modo Prova."
              : "Uma disciplina agrupa as unidades e os tópicos estudados nela."
        }
        initialName={nameDialog?.mode === "renomear" ? nameDialog.folder.name : ""}
        placeholder={nameDialog?.mode === "problema" ? "Ex.: Unidade 2" : "Ex.: Audiologia Clínica"}
        submitLabel={nameDialog?.mode === "renomear" ? "Salvar" : "Criar"}
        onSubmit={async (value) => {
          if (!nameDialog) return;
          if (nameDialog.mode === "renomear") await rename(nameDialog.folder.id, value);
          else await create(value, nameDialog.mode === "problema" ? nameDialog.parent.id : null);
        }}
      />
      <DeleteFolderDialog
        folder={deleteTarget?.folder ?? null}
        topicCount={deleteTarget?.topics ?? 0}
        problemCount={deleteTarget?.problems ?? 0}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      />

      <ThemeSwitcher className="border-t border-sidebar-border pt-3" />

      <div className="flex items-center gap-2.5 border-t border-sidebar-border pt-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tint-1 text-xs font-semibold text-tint-1-fg"
        >
          {initials}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm" title={user?.email ?? undefined}>
          {firstName}
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Sair"
          title="Sair"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          <LogOut className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

const COLLAPSED_KEY = "fonolab:pastas-recolhidas";
const TOPIC_MIME = "application/x-fonolab-topic";

/** Pastas recolhidas ficam lembradas neste navegador (só conforto visual; nada vai para o banco). */
function useCollapsedFolders() {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]") as unknown;
      if (Array.isArray(saved)) setIds(new Set(saved.filter((x): x is string => typeof x === "string")));
    } catch {
      // sem armazenamento: tudo começa aberto
    }
  }, []);
  const update = useCallback((change: (next: Set<string>) => void) => {
    setIds((prev) => {
      const next = new Set(prev);
      change(next);
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // sem armazenamento: vale só nesta visita
      }
      return next;
    });
  }, []);
  const expand = useCallback(
    (list: (string | null)[]) => update((next) => list.forEach((id) => id && next.delete(id))),
    [update],
  );
  return {
    has: (id: string) => ids.has(id),
    toggle: (id: string) => update((next) => (next.has(id) ? next.delete(id) : next.add(id))),
    expand,
  };
}
