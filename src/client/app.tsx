// src/client/app.tsx
// Client-side router, auth shell, and app layout.
import { useState, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Outlet,
  Navigate,
} from "react-router-dom";
import { apiGet } from "./api";
import { UserContext, useUser, type User } from "./auth";
import { Login } from "./pages/Login";
import { NewRequest } from "./pages/NewRequest";
import { MyList } from "./pages/MyList";
import { RequestDetail } from "./pages/RequestDetail";
import { Admin } from "./pages/Admin";
import { Definitions } from "./pages/Definitions";

// ---- Spinner ----

function Spinner() {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-3">
      {/* Simple CSS ring spinner — no external dep */}
      <div
        className="w-8 h-8 rounded-full border-2 border-border-subtle border-t-primary animate-spin"
        role="status"
        aria-label="Yükleniyor"
      />
      <span className="text-sm text-on-surface-variant">Yükleniyor…</span>
    </div>
  );
}

// ---- Authenticated layout shell ----
// Loads /api/me on mount; while loading shows spinner; after success renders
// the full shell with the user context.

function AppLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiGet<User>("/api/me")
      .then((u) => {
        if (!cancelled) {
          setUser(u);
          setLoading(false);
        }
      })
      .catch(() => {
        // apiGet already redirected to /auth/google on 401.
        // Other errors: stop the spinner so the page isn't stuck.
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Spinner />;
  if (!user) return null; // redirect in flight

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      "text-sm font-medium px-3 py-1 rounded transition-colors",
      isActive
        ? "bg-primary text-primary-fg"
        : "text-primary hover:bg-surface-container",
    ].join(" ");

  return (
    <UserContext.Provider value={user}>
      <div className="min-h-screen bg-surface">
        {/* ---- Header ---- */}
        <header className="bg-white border-b border-border-subtle">
          <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
            {/* Brand */}
            <NavLink
              to="/"
              className="font-semibold text-primary tracking-tight text-base hover:opacity-80 transition-opacity"
            >
              Talep Portalı
            </NavLink>

            {/* Nav */}
            <nav className="flex items-center gap-1">
              <NavLink to="/my" className={linkClass}>
                Taleplerim
              </NavLink>
              {user.isAdmin && (
                <NavLink to="/admin" className={linkClass}>
                  Yönetim
                </NavLink>
              )}
              {user.isAdmin && (
                <NavLink to="/admin/tanimlar" className={linkClass}>
                  Tanımlar
                </NavLink>
              )}
            </nav>

            {/* User info + logout */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-on-surface-variant hidden sm:block truncate max-w-[160px]">
                {user.name || user.email}
              </span>
              {/* POST to /logout — CSRF cookie flows naturally via browser form */}
              <form method="post" action="/logout">
                <button
                  type="submit"
                  className="text-sm font-medium text-secondary hover:text-on-surface transition-colors"
                >
                  Çıkış
                </button>
              </form>
            </div>
          </div>
        </header>

        {/* ---- Page content ---- */}
        <Outlet />
      </div>
    </UserContext.Provider>
  );
}

// ---- Home redirector ----
// Index route: send users to a role-appropriate landing page.

function Home() {
  const user = useUser();
  return <Navigate to={user.isAdmin ? "/admin" : "/my"} replace />;
}

// ---- Root app ----

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public route — outside the auth gate */}
        <Route path="/login" element={<Login />} />

        {/* Authenticated shell — all children require a valid session */}
        <Route element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="/yeni" element={<NewRequest />} />
          <Route path="/my" element={<MyList />} />
          <Route path="/requests/:id" element={<RequestDetail />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/tanimlar" element={<Definitions />} />
        </Route>

        {/* Fallback: redirect unknown paths to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
