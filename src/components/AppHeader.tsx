import { Link, useNavigate } from "@tanstack/react-router";
import { Ear, GraduationCap, LogOut, Menu } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth" });
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
            <Ear className="size-5" />
          </span>
          <span className="font-serif text-xl font-semibold tracking-tight">FonoLab</span>
        </Link>
        {user && (
          <>
            {/* Navegação inline — telas médias/grandes */}
            <nav className="hidden items-center gap-1 text-sm md:flex">
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
              <button
                onClick={handleSignOut}
                title={user.email ?? "Sair"}
                className="ml-1 flex items-center gap-1.5 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <LogOut className="size-4" />
              </button>
            </nav>

            {/* Menu hambúrguer — tablet/celular */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex size-9 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent md:hidden"
                  aria-label="Abrir menu"
                >
                  <Menu className="size-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link to="/" className="flex w-full items-center gap-2">
                    Tópicos
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/prova" className="flex w-full items-center gap-2">
                    <GraduationCap className="size-4" /> Modo Prova
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="gap-2 text-destructive focus:text-destructive">
                  <LogOut className="size-4" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </header>
  );
}