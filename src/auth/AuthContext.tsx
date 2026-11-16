import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export type AuthState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "signed_in"; session: Session; isAdmin: boolean }
  | { status: "error"; message: string };

type AuthContextValue = {
  state: AuthState;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadAdminStatus(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data !== null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    const resolveSession = (session: Session | null) => {
      (async () => {
        if (!session) {
          if (active) setState({ status: "signed_out" });
          return;
        }
        try {
          const isAdmin = await loadAdminStatus(session.user.id);
          if (active) setState({ status: "signed_in", session, isAdmin });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not check your access.";
          if (active) setState({ status: "error", message });
        }
      })();
    };

    supabase.auth.getSession().then(({ data }) => resolveSession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      resolveSession(session);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}