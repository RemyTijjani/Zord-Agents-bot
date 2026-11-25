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
        <div className="sidebar-brand">
          <div className="brand">ZORD<span>.</span></div>
          <span className="sidebar-caption">AGENT CONTROL</span>
        </div>
        <div className="nav-group">
          <span className="nav-heading">WORKSPACE</span>
          <nav className="nav" aria-label="Main navigation">
            <NavLink to="/" end className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <span className="nav-mark" aria-hidden="true">◫</span><span>Overview</span>
            </NavLink>
            <NavLink to="/communities" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <span className="nav-mark" aria-hidden="true">◎</span><span>Communities</span>
            </NavLink>
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="account-card">
            <span className="account-avatar" aria-hidden="true">A</span>
            <div className="account-details">
              <span className="account-role">Signed in as</span>
              <strong title={accountLabel}>{accountLabel}</strong>
            </div>
          </div>
          <button type="button" className="btn signout-btn" onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>
      <main className="main-panel">
        <div className="topbar">
          <div><span className="topbar-kicker">ZORD / ADMINISTRATION</span><span className="topbar-title">Control centre</span></div>
          <span className="admin-status"><span className="status-dot" /> Admin session</span>
        </div>
        <div className="content"><div className="content-inner"><Outlet /></div></div>
      </main>
    </div>
  );
}
