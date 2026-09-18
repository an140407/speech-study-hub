import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Ear, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — FonoLab" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) navigate({ to: "/" });
  }, [authLoading, user, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (mode === "signup") {
      toast.success("Conta criada! Se pedir confirmação por e-mail, confira sua caixa de entrada antes de entrar.");
      setMode("signin");
    } else {
      navigate({ to: "/" });
    }
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-4">
      <div className="mb-6 flex items-center justify-center gap-2">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
          <Ear className="size-5" />
        </span>
        <span className="font-serif text-2xl font-semibold tracking-tight">FonoLab</span>
      </div>
      <form onSubmit={handleSubmit} className="card-soft space-y-4 p-6">
        <h1 className="text-lg font-semibold">{mode === "signin" ? "Entrar" : "Criar conta"}</h1>
        <Input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <Input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
        />
        <Button type="submit" className="h-11 w-full rounded-xl" disabled={submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {mode === "signin" ? "Entrar" : "Criar conta"}
        </Button>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "Não tem conta? Criar uma" : "Já tem conta? Entrar"}
        </button>
      </form>
    </main>
  );
}