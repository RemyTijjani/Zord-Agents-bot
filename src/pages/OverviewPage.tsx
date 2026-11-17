import { useEffect, useState } from "react";
import StatusBadge from "../components/StatusBadge";

type Stats = {
  communities: number;
  pendingCommunities: number;
  updates: number;
  failedUpdates: number;
};

type UpdateRow = {
  update_id: number;
  update_type: string;
  status: string;
  error: string | null;
  received_at: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; stats: Stats; recent: UpdateRow[] };

type ConnectionState =
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export default function OverviewPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [connection, setConnection] = useState<ConnectionState>({ status: "idle" });

  useEffect(() => {
    let active = true;
    fetch("/api/admin/overview", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? "Your administrator session has expired." : "The overview could not be loaded.");
        return response.json() as Promise<{ stats: Stats; recent: UpdateRow[] }>;
      })
      .then((data) => {
        if (active) setState({ status: "ready", stats: data.stats, recent: data.recent });
      })
      .catch((error: unknown) => {
        if (active) setState({ status: "error", message: error instanceof Error ? error.message : "Unexpected server error." });
      });
    return () => { active = false; };
  }, []);

  async function connectTelegram() {
    setConnection({ status: "connecting" });
    try {
      const response = await fetch("/api/admin/connect-telegram", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok || result.ok !== true) {
        throw new Error(result.error || "Telegram webhook setup failed.");
      }
      setConnection({
        status: "success",
        message: "Webhook connected. Now add the bot as an administrator to a Telegram group or channel.",
      });
    } catch (error) {
      setConnection({
        status: "error",
        message: error instanceof Error ? error.message : "Could not connect the Telegram bot.",
      });
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>Overview</h1>
        <p>Live status of your Telegram communities and incoming bot activity.</p>
      </header>

      {state.status === "loading" && <div className="state-box">Loading overview...</div>}
      {state.status === "error" && (
        <div className="notice notice-error" role="alert">
          The overview could not be loaded: {state.message}
        </div>
      )}
      {state.status === "ready" && (
        <>
          <section className="card">
            <h2 className="section-title">Telegram bot connection</h2>
            <p className="muted">Register the secure webhook so Telegram can notify ZORD when the bot is added to, removed from, or has its permissions changed in a group or channel.</p>
            <button
              type="button"
              className="btn"
              onClick={() => void connectTelegram()}
              disabled={connection.status === "connecting"}
            >
              {connection.status === "connecting" ? "Connecting..." : connection.status === "success" ? "Reconnect webhook" : "Connect Telegram bot"}
            </button>
            {connection.status === "success" && <p className="notice notice-success" role="status">{connection.message}</p>}
            {connection.status === "error" && <p className="notice notice-error" role="alert">{connection.message}</p>}
          </section>

          <section className="stat-grid">
            <div className="card">
              <div className="stat-label">Connected communities</div>
              <div className="stat-value">{state.stats.communities}</div>
            </div>
            <div className="card">
              <div className="stat-label">Restricted communities</div>
              <div className="stat-value">{state.stats.pendingCommunities}</div>
            </div>
            <div className="card">
              <div className="stat-label">Telegram updates received</div>
              <div className="stat-value">{state.stats.updates}</div>
            </div>
            <div className="card">
              <div className="stat-label">Failed updates</div>
              <div className="stat-value">{state.stats.failedUpdates}</div>
            </div>
          </section>

          <section className="card">
            <h2 className="section-title">Recent Telegram activity</h2>
            {state.recent.length === 0 ? (
              <p className="muted">No Telegram activity yet. Add the bot to a group or channel to see connection events here.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Received</th><th>Type</th><th>Status</th><th>Details</th></tr>
                  </thead>
                  <tbody>
                    {state.recent.map((row) => (
                      <tr key={row.update_id}>
                        <td>{new Date(row.received_at).toLocaleString()}</td>
                        <td>{row.update_type}</td>
                        <td><StatusBadge status={row.status} /></td>
                        <td className="muted">{row.error ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
