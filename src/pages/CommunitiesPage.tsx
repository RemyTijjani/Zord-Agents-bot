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

type IntelligenceProfile = { community_name: string; description: string; topic: string; audience: string; focus_topics: string[]; rules: string; tone: string; content_preferences: string };
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
  const [profileChatId, setProfileChatId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, IntelligenceProfile>>({});
  const [profileSaving, setProfileSaving] = useState(false);

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

 
  async function openIntelligence(chatId: string) {
    if (profileChatId === chatId) { setProfileChatId(null); return; }
    setProfileChatId(chatId);
    if (profiles[chatId]) return;
    try {
      const response = await fetch(`/api/admin/community-intelligence?chat_id=${encodeURIComponent(chatId)}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Community profile could not be loaded.");
      const data = await response.json() as { profile: Partial<IntelligenceProfile> };
      setProfiles((current) => ({ ...current, [chatId]: {
        community_name: data.profile.community_name || "",
        description: data.profile.description || "",
        topic: data.profile.topic || "",
        audience: data.profile.audience || "",
        focus_topics: data.profile.focus_topics || [],
        rules: data.profile.rules || "",
        tone: data.profile.tone || "helpful, respectful and clear",
        content_preferences: data.profile.content_preferences || "",
      }}));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Community profile could not be loaded.");
    }
  }

  function updateProfile(chatId: string, key: keyof IntelligenceProfile, value: string | string[]) {
    setProfiles((current) => ({ ...current, [chatId]: { ...current[chatId], [key]: value } }));
  }

  async function saveProfile(chatId: string) {
    const profile = profiles[chatId];
    if (!profile) return;
    setProfileSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/community-intelligence", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, ...profile }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || result.ok !== true) throw new Error(result.error || "Community profile could not be saved.");
      setNotice(`Community Intelligence saved for ${profile.community_name || chatId}. All enabled agents will use this profile.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Community profile could not be saved.");
    } finally {
      setProfileSaving(false);
    }
  }

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
                <div className="agent-settings">
                  <button type="button" className="btn" onClick={() => void openIntelligence(row.id)}>
                    {profileChatId === row.id ? "Close Community Intelligence" : "Configure Community Intelligence"}
                  </button>
                  {profileChatId === row.id && profiles[row.id] && (
                    <div className="agent-settings">
                      <h3>Community Intelligence profile</h3>
                      <p className="muted">This profile is private to this Telegram community and powers all three agents.</p>
                      {([
                        ["community_name", "Community name"],
                        ["description", "What is this community about?"],
                        ["topic", "Main subject / industry"],
                        ["audience", "Who is this community for?"],
                        ["focus_topics", "Important topics (comma-separated)"],
                        ["rules", "Community rules and moderation priorities"],
                        ["tone", "Preferred communication style"],
                        ["content_preferences", "Preferred posts, content and meme style"],
                      ] as Array<[keyof IntelligenceProfile, string]>).map(([key, label]) => (
                        <label className="agent-option" key={key}>
                          <span><strong>{label}</strong></span>
                          {key === "description" || key === "rules" || key === "content_preferences" ? (
                            <textarea rows={3} value={key === "focus_topics" ? "" : String(profiles[row.id][key])}
                              onChange={(event) => updateProfile(row.id, key, event.target.value)} />
                          ) : (
                            <input value={key === "focus_topics" ? profiles[row.id].focus_topics.join(", ") : String(profiles[row.id][key])}
                              onChange={(event) => updateProfile(row.id, key, key === "focus_topics" ? event.target.value.split(",").map((v) => v.trim()).filter(Boolean) : event.target.value)} />
                          )}
                        </label>
                      ))}
                      <button type="button" className="btn btn-primary" disabled={profileSaving} onClick={() => void saveProfile(row.id)}>
                        {profileSaving ? "Saving profile..." : "Save Community Intelligence"}
                      </button>
                    </div>
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
