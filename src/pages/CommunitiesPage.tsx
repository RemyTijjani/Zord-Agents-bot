import { useEffect, useState } from "react";
import StatusBadge from "../components/StatusBadge";

type CommunityRow = {
  id: string;
  title: string;
  chat_type: string;
  status: string;
  added_at: string;
  last_seen_at: string | null;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: CommunityRow[] };

export default function CommunitiesPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    fetch("/api/admin/communities", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? "Your administrator session has expired." : "Communities could not be loaded.");
        return response.json() as Promise<{ communities: CommunityRow[] }>;
      })
      .then((data) => {
        if (active) setState({ status: "ready", rows: data.communities });
      })
      .catch((error: unknown) => {
        if (active) setState({ status: "error", message: error instanceof Error ? error.message : "Unexpected server error." });
      });
    return () => { active = false; };
  }, []);

  return (
    <>
      <header className="page-header">
        <h1>Communities</h1>
        <p>Telegram groups and channels where the ZORD bot has been added.</p>
      </header>

      {state.status === "loading" && <div className="state-box">Loading communities...</div>}
      {state.status === "error" && (
        <div className="notice notice-error" role="alert">
          Communities could not be loaded: {state.message}
        </div>
      )}
      {state.status === "ready" && (
        state.rows.length === 0 ? (
          <div className="card state-box">
            No communities yet. Add the ZORD bot to a Telegram group as an administrator and it will appear here.
          </div>
        ) : (
          <div className="card table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Type</th><th>Status</th><th>Added</th><th>Last seen</th></tr>
              </thead>
              <tbody>
                {state.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title || "Untitled"}</td>
                    <td className="muted">{row.chat_type}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>{new Date(row.added_at).toLocaleString()}</td>
                    <td>{row.last_seen_at ? new Date(row.last_seen_at).toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </>
  );
}
