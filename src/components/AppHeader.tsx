import { Link } from "@tanstack/react-router";
import { Ear, GraduationCap } from "lucide-react";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
            <Ear className="size-5" />
          </span>
          <span className="font-serif text-xl font-semibold tracking-tight">FonoLab</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/"
            className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            activeProps={{ className: "rounded-lg px-3 py-2 bg-accent text-accent-foreground font-medium" }}
            activeOptions={{ exact: true }}
          >
            Tópicos
          </Link>
          <Link
            to="/prova"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            activeProps={{ className: "flex items-center gap-1.5 rounded-lg px-3 py-2 bg-accent text-accent-foreground font-medium" }}
          >
            <GraduationCap className="size-4" /> Modo Prova
          </Link>
        </nav>
      </div>
    </header>
  );
}