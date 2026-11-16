import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
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
    (async () => {
      const { data, error } = await supabase
        .from("telegram_communities")
        .select("id, title, chat_type, status, added_at, last_seen_at")
        .order("added_at", { ascending: false })
        .limit(100);

      if (!active) return;
      if (error) {
        setState({ status: "error", message: error.message });
        return;
      }
      if (!Array.isArray(data)) {
        setState({ status: "error", message: "Unexpected response while loading communities." });
        return;
      }
      setState({ status: "ready", rows: data as CommunityRow[] });
    })();
    return () => {
      active = false;
    };
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
      {state.status === "ready" &&
        (state.rows.length === 0 ? (
          <div className="card state-box">
            No communities yet. Add the ZORD bot to a Telegram group as an administrator and it will appear here.
          </div>
        ) : (
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title || "Untitled"}</td>
                    <td className="muted">{row.chat_type}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>{new Date(row.added_at).toLocaleString()}</td>
                    <td>{row.last_seen_at ? new Date(row.last_seen_at).toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </>
  );
}