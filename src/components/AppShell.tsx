import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function AppShell() {
  const { state, signOut } = useAuth();
  const accountLabel = state.status === "signed_in"
    ? (state.user.username ? "@" + state.user.username : state.user.name || "Telegram administrator")
    : "Administrator";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">ZORD<span>.</span></div>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end className="nav-link">Overview</NavLink>
          <NavLink to="/communities" className="nav-link">Communities</NavLink>
        </nav>
        <div className="sidebar-footer">
          <span className="muted" style={{ wordBreak: "break-all" }}>{accountLabel}</span>
          <button type="button" className="btn" onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}
