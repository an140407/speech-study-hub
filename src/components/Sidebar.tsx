import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { GraduationCap, LogOut, NotebookPen, Plus, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BrandMark, Wordmark } from "@/components/BrandMark";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cleanTitle, progressPct, useTopicsList, useTopicsProgress } from "@/lib/topics-index";
import { cn } from "@/lib/utils";

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
  const [filter, setFilter] = useState("");
  const uid = useId();
  const headingId = `${uid}-indice`;
  const filterId = `${uid}-filtro`;

  const list = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase("pt-BR");
    return (topics.data ?? [])
      .map((t) => ({ ...t, label: cleanTitle(t.title) }))
      .filter((t) => !q || t.label.toLocaleLowerCase("pt-BR").includes(q));
  }, [topics.data, filter]);

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
      </nav>

      <section aria-labelledby={headingId} className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between px-2.5 pb-2">
          <h2
            id={headingId}
            className="font-sans text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground"
          >
            Índice
          </h2>
          {!!topics.data?.length && (
            <span className="text-xs text-muted-foreground tnum">{topics.data.length}</span>
          )}
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
              placeholder="Filtrar"
              className="h-9 w-full rounded-md border border-sidebar-border bg-sidebar-accent/60 pl-8 pr-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-sidebar-accent"
            />
          </div>
        )}

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {topics.isLoading ? (
            <ul className="space-y-1" aria-hidden>
              {[70, 85, 60, 78].map((w, i) => (
                <li key={i} className="h-8 rounded-md px-2.5 py-2">
                  <div className="h-3.5 rounded bg-black/[0.06]" style={{ width: `${w}%` }} />
                </li>
              ))}
            </ul>
          ) : !list.length ? (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">
              {filter ? "Nenhum tópico com esse nome." : "Seus tópicos aparecem aqui."}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {list.map((t) => {
                const active = pathname === `/topico/${t.id}`;
                const pct = progressPct(progress.data?.byTopic[t.id]);
                return (
                  <li key={t.id}>
                    <Link
                      to="/topico/$id"
                      params={{ id: t.id }}
                      title={t.label}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-9 items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent text-foreground shadow-[0_0_0_1px_var(--color-sidebar-border)]"
                          : "text-foreground/80 hover:bg-sidebar-accent/70 hover:text-foreground",
                      )}
                    >
                      <span className="truncate">{t.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tnum">{pct}%</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

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