import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const errorMessages: Record<string, string> = {
  not_authorized: "This Telegram account is not authorized to access the administrator dashboard.",
  telegram_login_cancelled: "Telegram login was cancelled. You can try again.",
  telegram_login_failed: "Telegram login could not be completed. Please try again.",
  login_not_configured: "Telegram login setup is incomplete. Contact the system owner.",
};

export default function SignInPage() {
  const { state } = useAuth();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const error = params.get("error");

  if (state.status === "signed_in") return <Navigate to="/" replace />;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div>
          <div className="brand">ZORD<span>.</span></div>
          <h1 style={{ marginTop: 24, fontSize: 28 }}>Administrator sign in</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            Secure access for the authorized ZORD Agents Bot administrator.
          </p>
        </div>

        <div className="form card">
          <div className="muted">
            Sign in with the Telegram account registered as the dashboard owner. Other accounts are denied automatically.
          </div>
          {error && (
            <div className="notice notice-error" role="alert">
              {errorMessages[error] ?? "Login could not be completed. Please try again."}
            </div>
          )}
          {state.status === "error" && (
            <div className="notice notice-error" role="alert">{state.message}</div>
          )}
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || state.status === "loading"}
            onClick={() => {
              setBusy(true);
              window.location.assign("/api/auth/telegram/start");
            }}
          >
            {busy ? "Connecting to Telegram..." : "Continue with Telegram"}
          </button>
          <p className="muted" style={{ fontSize: 12 }}>
            Telegram verifies your identity. ZORD checks your administrator permission on its separate Neon database.
          </p>
        </div>
      </div>
    </div>
  );
}
