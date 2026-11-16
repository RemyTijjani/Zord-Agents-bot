import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";

type Mode = "sign_in" | "sign_up";

function friendlyAuthError(message: string): string {
  if (message.includes("Invalid login credentials")) {
    return "The email or password is incorrect.";
  }
  if (message.includes("already registered")) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (message.includes("Failed to fetch")) {
    return "Could not reach the server. Check your connection and try again.";
  }
  return message;
}

export default function SignInPage() {
  const { state } = useAuth();
  const [mode, setMode] = useState<Mode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (state.status === "signed_in") {
    return <Navigate to="/" replace />;
  }

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const credentials = { email: email.trim(), password };
    const result =
      mode === "sign_in"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    setBusy(false);

    if (result.error) {
      setError(friendlyAuthError(result.error.message));
      return;
    }

    if (mode === "sign_up" && !result.data.session) {
      setMode("sign_in");
      setPassword("");
      setNotice("Your account has been created. Sign in with your email and password.");
    }
  };

  const isSignUp = mode === "sign_up";

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div>
          <div className="brand">
            ZORD<span>.</span>
          </div>
          <h1 style={{ marginTop: 24, fontSize: 28 }}>{isSignUp ? "Create your account" : "Sign in"}</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            {isSignUp
              ? "Create an account to access the ZORD agent dashboard."
              : "Sign in to manage your ZORD agents and Telegram communities."}
          </p>
        </div>

        <form className="form card" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {isSignUp && <span className="muted">Use at least 8 characters.</span>}
          </label>

          {error && <div className="notice notice-error" role="alert">{error}</div>}
          {notice && <div className="notice notice-success" role="status">{notice}</div>}

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Please wait..." : isSignUp ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="muted">
          {isSignUp ? "Already have an account? " : "New to ZORD? "}
          <button
            type="button"
            className="btn-link"
            onClick={() => switchMode(isSignUp ? "sign_in" : "sign_up")}
          >
            {isSignUp ? "Sign in" : "Create an account"}
          </button>
        </p>
      </div>
    </div>
  );
}