import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/Sidebar";

// Confere o login com o servidor só na primeira navegação da sessão. Depois disso a
// sessão local basta: trocar de aba ou de tópico não espera uma ida ao Supabase.
let verified = false;

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (!verified) {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw redirect({ to: "/auth" });
      verified = true;
      return { user: data.user };
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      verified = false;
      throw redirect({ to: "/auth" });
    }
    return { user: data.session.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});