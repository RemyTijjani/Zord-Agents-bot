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
  | { status: "checking" }
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "connected"; pendingUpdates: number; hasRecentDeliveryError: boolean }
  | { status: "error"; message: string };

export default function OverviewPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [connection, setConnection] = useState<ConnectionState>({ status: "checking" });

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

    fetch("/api/admin/telegram-status", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? "Your administrator session has expired." : "Telegram connection status could not be checked.");
        return response.json() as Promise<{ connected: boolean; pendingUpdates: number; hasRecentDeliveryError: boolean }>;
      })
      .then((data) => {
        if (!active) return;
        setConnection(data.connected
          ? { status: "connected", pendingUpdates: data.pendingUpdates, hasRecentDeliveryError: data.hasRecentDeliveryError }
          : { status: "disconnected" });
      })
      .catch((error: unknown) => {
        if (active) setConnection({ status: "error", message: error instanceof Error ? error.message : "Could not check the Telegram connection." });
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
      const statusResponse = await fetch("/api/admin/telegram-status", { credentials: "same-origin", cache: "no-store" });
      if (!statusResponse.ok) throw new Error("Webhook was registered, but its status could not be verified. Refresh the page to check it.");
      const status = await statusResponse.json() as { connected: boolean; pendingUpdates: number; hasRecentDeliveryError: boolean };
      setConnection(status.connected
        ? { status: "connected", pendingUpdates: status.pendingUpdates, hasRecentDeliveryError: status.hasRecentDeliveryError }
        : { status: "disconnected" });
    } catch (error) {
      setConnection({
        status: "error",
        message: error instanceof Error ? error.message : "Could not connect the Telegram bot.",
      });
    }
  }

  const isConnecting = connection.status === "connecting";
  const isConnected = connection.status === "connected";

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
            {connection.status === "checking" && <p className="muted" role="status">Checking Telegram connection...</p>}
            {isConnected && (
              <p className="notice notice-success" role="status">
                Telegram webhook is connected and verified.
                {connection.status === "connected" && connection.hasRecentDeliveryError && " Telegram reports a recent delivery issue; check the activity below."}
                {connection.status === "connected" && connection.pendingUpdates > 0 && ` ${connection.pendingUpdates} update(s) are waiting to be delivered.`}
              </p>
            )}
            {connection.status === "disconnected" && <p className="notice notice-error" role="status">Telegram webhook is not connected.</p>}
            <button
              type="button"
              className="btn"
              onClick={() => void connectTelegram()}
              disabled={isConnecting || connection.status === "checking"}
            >
              {isConnecting ? "Connecting..." : isConnected ? "Reconnect webhook" : "Connect Telegram bot"}
            </button>
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
