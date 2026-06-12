// src/client/app.tsx
// Client-side router and layout shell.
import { BrowserRouter, Routes, Route, NavLink, Outlet } from "react-router-dom";

// ---- Placeholder page components (replaced in B2-B4) ----

function NewRequestPage() {
  return (
    <main className="max-w-container mx-auto px-4 py-8">
      <div className="text-on-surface-variant">Yeni Talep</div>
    </main>
  );
}

function MyRequestsPage() {
  return (
    <main className="max-w-container mx-auto px-4 py-8">
      <div className="text-on-surface-variant">Taleplerim</div>
    </main>
  );
}

function RequestDetailPage() {
  return (
    <main className="max-w-container mx-auto px-4 py-8">
      <div className="text-on-surface-variant">Talep Detayı</div>
    </main>
  );
}

function AdminPage() {
  return (
    <main className="max-w-container mx-auto px-4 py-8">
      <div className="text-on-surface-variant">Yönetim Paneli</div>
    </main>
  );
}

// ---- App layout with nav header ----

function AppLayout() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      "text-sm font-medium px-3 py-1 rounded transition-colors",
      isActive
        ? "bg-primary text-primary-fg"
        : "text-primary hover:bg-surface-container",
    ].join(" ");

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-white border-b border-border-subtle shadow-sm">
        <div className="max-w-container mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <span className="font-semibold text-primary tracking-tight">
            Talep Portalı
          </span>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              Yeni Talep
            </NavLink>
            <NavLink to="/my" className={linkClass}>
              Taleplerim
            </NavLink>
            <NavLink to="/admin" className={linkClass}>
              Yönetim
            </NavLink>
          </nav>
          {/* Logout via form POST so CSRF cookie flows naturally */}
          <form method="post" action="/logout">
            <button
              type="submit"
              className="text-sm text-secondary hover:text-on-surface transition-colors"
            >
              Çıkış
            </button>
          </form>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

// ---- Root app ----

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<NewRequestPage />} />
          <Route path="/my" element={<MyRequestsPage />} />
          <Route path="/requests/:id" element={<RequestDetailPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
