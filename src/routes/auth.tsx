import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { lovable } from "@/integrations/lovable/index";
import { BrandMark } from "@/components/BrandMark";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Entrar — FonoLab" },
      { name: "description", content: "Acesse o FonoLab com sua conta Google pra gerar e revisar seu material de estudo." },
      { property: "og:title", content: "Entrar — FonoLab" },
      { property: "og:type", content: "website" },
    ],
  }),
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  const handleGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });

    if (result.error) {
      setBusy(false);
      toast.error(result.error.message || "Não foi possível entrar com o Google.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="card-soft w-full max-w-sm p-8 text-center">
        <BrandMark className="mx-auto size-12" />
        <h1 className="mt-6 text-4xl leading-none">
          Entrar no Fono<i>lab</i>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use sua conta Google pra gerar e guardar seu material de estudo.
        </p>
        <Button onClick={handleGoogle} disabled={busy} className="mt-6 h-11 w-full rounded-md">
          {busy ? "Conectando…" : "Continuar com Google"}
        </Button>
      </div>
    </main>
  );
}