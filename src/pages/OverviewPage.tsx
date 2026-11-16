import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
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

export default function OverviewPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    (async () => {
      const [communities, pending, updates, failed, recent] = await Promise.all([
        supabase.from("telegram_communities").select("id", { count: "exact", head: true }),
        supabase.from("telegram_communities").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("telegram_updates").select("update_id", { count: "exact", head: true }),
        supabase.from("telegram_updates").select("update_id", { count: "exact", head: true }).eq("status", "failed"),
        supabase
          .from("telegram_updates")
          .select("update_id, update_type, status, error, received_at")
          .order("received_at", { ascending: false })
          .limit(10),
      ]);

      const failure = [communities, pending, updates, failed, recent].find((result) => result.error);
      if (failure?.error) {
        if (active) setState({ status: "error", message: failure.error.message });
        return;
      }
      if (!Array.isArray(recent.data)) {
        if (active) setState({ status: "error", message: "Unexpected response while loading updates." });
        return;
      }

      if (active) {
        setState({
          status: "ready",
          stats: {
            communities: communities.count ?? 0,
            pendingCommunities: pending.count ?? 0,
            updates: updates.count ?? 0,
            failedUpdates: failed.count ?? 0,
          },
          recent: recent.data as UpdateRow[],
        });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

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
          <section className="stat-grid">
            <div className="card">
              <div className="stat-label">Connected communities</div>
              <div className="stat-value">{state.stats.communities}</div>
            </div>
            <div className="card">
              <div className="stat-label">Awaiting setup</div>
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
              <p className="muted">No Telegram activity yet. Send /start to your ZORD bot to see it here.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Received</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.recent.map((row) => (
                      <tr key={row.update_id}>
                        <td>{new Date(row.received_at).toLocaleString()}</td>
                        <td>{row.update_type}</td>
                        <td>
                          <StatusBadge status={row.status} />
                        </td>
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