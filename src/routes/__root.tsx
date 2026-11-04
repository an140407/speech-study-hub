import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { BrandMark } from "@/components/BrandMark";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

function NotFoundComponent() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <BrandMark className="mx-auto size-12" />
        <p className="mt-8 font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-5xl leading-none">
          Esta página <i>não existe</i>
        </h1>
        <p className="mt-4 text-muted-foreground">
          O endereço pode estar errado ou o tópico foi excluído.
        </p>
        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 active:scale-[0.98]"
          >
            Voltar aos tópicos
          </Link>
        </div>
      </div>
    </main>
  );
}

// Depois de uma atualização do app, uma aba aberta pode pedir um pedaço de código que mudou
// de endereço. Não é bug do conteúdo: recarregar a página resolve.
const STALE_CODE_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
const RELOAD_KEY = "fonolab:recarregou-em";

/** Recarrega uma vez (no máximo a cada 10 s, para nunca entrar em loop). */
function reloadForNewVersion(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (!STALE_CODE_ERROR.test(message)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 10_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    if (reloadForNewVersion(error)) return;
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <BrandMark className="mx-auto size-12" />
        <h1 className="mt-8 text-4xl leading-none">Esta página não carregou</h1>
        <p className="mt-4 text-muted-foreground">
          Algo deu errado do nosso lado. Tente de novo ou volte para os tópicos.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              if (STALE_CODE_ERROR.test(error instanceof Error ? error.message : String(error))) {
                window.location.reload();
                return;
              }
              router.invalidate();
              reset();
            }}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 active:scale-[0.98]"
          >
            Tentar de novo
          </button>
          <a
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar aos tópicos
          </a>
        </div>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "FonoLab — Estude Fonoaudiologia com IA" },
      { name: "description", content: "Gere resumo, esquema, flashcards, questões e casos clínicos de Fonoaudiologia a partir da sua aula." },
      { name: "theme-color", content: "#FAF9F6" },
      { property: "og:title", content: "FonoLab" },
      { property: "og:description", content: "O caderno de estudo da Fono: resumo, esquema, flashcards e questões gerados por IA." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://fonolab.lovable.app/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://fonolab.lovable.app/og-image.png" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico?v=2", sizes: "32x32" },
      { rel: "icon", href: "/favicon.svg?v=2", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=2" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Mesmo caso no site publicado: o Vite avisa quando não acha um pedaço de código antigo.
  useEffect(() => {
    const onPreloadError = (event: Event) => {
      const payload = (event as Event & { payload?: unknown }).payload;
      if (reloadForNewVersion(payload ?? new Error("Failed to fetch dynamically imported module"))) {
        event.preventDefault();
      }
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    return () => window.removeEventListener("vite:preloadError", onPreloadError);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}