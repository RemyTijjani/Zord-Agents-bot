import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import AppShell from "./components/AppShell";
import SignInPage from "./pages/SignInPage";
import OverviewPage from "./pages/OverviewPage";
import CommunitiesPage from "./pages/CommunitiesPage";

function AccessMessage({ title, message }: { title: string; message: string }) {
  const { signOut } = useAuth();
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand">
          ZORD<span>.</span>
        </div>
        <div className="card form">
          <h1>{title}</h1>
          <p className="muted">{message}</p>
          <button type="button" className="btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function RequireAdmin() {
  const { state } = useAuth();

  if (state.status === "loading") {
    return <div className="state-box">Loading...</div>;
  }
  if (state.status === "error") {
    return <AccessMessage title="Something went wrong" message={state.message} />;
  }
  if (state.status === "signed_out") {
    return <Navigate to="/sign-in" replace />;
  }
  if (!state.isAdmin) {
    return (
      <AccessMessage
        title="Administrator access required"
        message="Your account does not have access to the ZORD dashboard. Ask the ZORD owner to grant administrator access."
      />
    );
  }
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route element={<RequireAdmin />}>
        <Route element={<AppShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="communities" element={<CommunitiesPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}