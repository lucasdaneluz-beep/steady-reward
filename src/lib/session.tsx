import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type State = { user: User | null; ready: boolean; error: string | null; retry: () => void };
const Ctx = createContext<State>({ user: null, ready: false, error: null, retry: () => {} });

/** Ensures every visitor has a session: existing account, or an instant guest one. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        await supabase.auth.signOut({ scope: "local" });
      }

      if (data.session && !sessionError) {
        const { data: current, error: userError } = await supabase.auth.getUser();
        const errorText = userError?.message.toLowerCase() ?? "";
        const staleUser = errorText.includes("sub claim")
          || errorText.includes("user does not exist")
          || errorText.includes("user_not_found");

        if (!userError && current.user) {
          if (!cancelled) { setUser(current.user); setReady(true); }
          return;
        }

        if (!staleUser) {
          if (!cancelled) setError(userError?.message ?? "Unable to validate your session.");
          return;
        }

        await supabase.auth.signOut({ scope: "local" });
      }

      const { data: anon, error: err } = await supabase.auth.signInAnonymously();
      if (cancelled) return;
      if (err) { setError(err.message); return; }
      setUser(anon.user); setReady(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setUser(session?.user ?? null);
      if (event === "SIGNED_OUT") { qc.clear(); setReady(false); setAttempt((a) => a + 1); }
      else qc.invalidateQueries();
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [attempt, qc]);

  return <Ctx.Provider value={{ user, ready, error, retry: () => setAttempt((a) => a + 1) }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
