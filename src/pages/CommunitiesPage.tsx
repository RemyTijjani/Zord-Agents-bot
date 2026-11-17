import { useEffect, useState } from "react";
import StatusBadge from "../components/StatusBadge";

type ModuleKey = "sentinel" | "poly_shield" | "omini_glitch";
type CommunityRow = {
  id: string;
  title: string;
  chat_type: string;
  status: string;
  added_at: string;
  last_seen_at: string | null;
  enabled_modules: ModuleKey[];
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: CommunityRow[] };

const moduleOptions: Array<{ key: ModuleKey; name: string; detail: string }> = [
  { key: "sentinel", name: "Sentinel", detail: "Spam and scam protection" },
  { key: "poly_shield", name: "Poly-Shield", detail: "Multilingual moderation" },
  { key: "omini_glitch", name: "Omini Glitch", detail: "Community intelligence" },
];

export default function CommunitiesPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");

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

  function toggleModule(chatId: string, module: ModuleKey, checked: boolean) {
    setState((current) => current.status !== "ready" ? current : ({
      ...current,
      rows: current.rows.map((row) => row.id !== chatId ? row : ({
        ...row,
        enabled_modules: checked
          ? [...new Set([...row.enabled_modules, module])]
          : row.enabled_modules.filter((key) => key !== module),
      })),
    }));
    setNotice("");
  }

  async function saveModules(row: CommunityRow) {
    setSavingId(row.id);
    setNotice("");
    try {
      const response = await fetch("/api/admin/agent-settings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: row.id, enabled_modules: row.enabled_modules }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || result.ok !== true) throw new Error(result.error || "Agent settings could not be saved.");
      setNotice(`Agent settings saved for ${row.title || row.id}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Agent settings could not be saved.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>Communities</h1>
        <p>Manage the official ZORD agents separately for each Telegram group or channel.</p>
      </header>

      {state.status === "loading" && <div className="state-box">Loading communities...</div>}
      {state.status === "error" && (
        <div className="notice notice-error" role="alert">
          Communities could not be loaded: {state.message}
        </div>
      )}
      {notice && <div className="notice notice-success" role="status">{notice}</div>}
      {state.status === "ready" && (
        state.rows.length === 0 ? (
          <div className="card state-box">
            No communities yet. Add the ZORD bot to a Telegram group as an administrator and it will appear here.
          </div>
        ) : (
          <div className="community-list">
            {state.rows.map((row) => (
              <section className="card" key={row.id}>
                <div className="community-heading">
                  <div>
                    <h2>{row.title || "Untitled community"}</h2>
                    <p className="muted">{row.chat_type} · {row.id}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <div className="agent-settings">
                  <h3>Agent modules</h3>
                  {moduleOptions.map((module) => (
                    <label className="agent-option" key={module.key}>
                      <input
                        type="checkbox"
                        checked={row.enabled_modules.includes(module.key)}
                        disabled={row.status !== "active" || savingId === row.id}
                        onChange={(event) => toggleModule(row.id, module.key, event.target.checked)}
                      />
                      <span>
                        <strong>{module.name}</strong>
                        <small className="muted">{module.detail}</small>
                      </span>
                    </label>
                  ))}
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={row.status !== "active" || savingId === row.id}
                    onClick={() => void saveModules(row)}
                  >
                    {savingId === row.id ? "Saving..." : "Save agent settings"}
                  </button>
                  {row.status !== "active" && (
                    <p className="muted">Verify the bot's administrator permissions and group ownership before enabling agents.</p>
                  )}
                </div>
                <p className="muted community-meta">
                  Added {new Date(row.added_at).toLocaleString()} · Last seen {row.last_seen_at ? new Date(row.last_seen_at).toLocaleString() : "—"}
                </p>
              </section>
            ))}
          </div>
        )
      )}
    </>
  );
}
