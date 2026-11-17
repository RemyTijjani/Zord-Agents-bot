import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type TelegramAdmin = {
  id: string;
  username?: string;
  name?: string;
};

export type AuthState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "signed_in"; user: TelegramAdmin; isAdmin: true }
  | { status: "error"; message: string };

type AuthContextValue = {
  state: AuthState;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error("Could not verify your administrator session.");
        return response.json() as Promise<{ authenticated: boolean; user: TelegramAdmin }>;
      })
      .then((result) => {
        if (!active) return;
        if (!result?.authenticated) setState({ status: "signed_out" });
        else setState({ status: "signed_in", user: result.user, isAdmin: true });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not check your access.",
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      signOut: async () => {
        const response = await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
        });
        if (!response.ok) throw new Error("Could not sign out. Please try again.");
        setState({ status: "signed_out" });
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
