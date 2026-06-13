// src/client/layouts/AdminLayout.tsx
// Admin-gated console chrome: left sidebar with nav + user/logout.
import { Suspense } from "react";
import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useUser } from "../auth";
import { Spinner } from "../components/Spinner";

const sideLink = ({ isActive }: { isActive: boolean }) =>
  [
    "block px-3 py-2 rounded text-sm font-medium transition-colors",
    isActive
      ? "bg-primary text-primary-fg"
      : "text-on-surface hover:bg-surface-container",
  ].join(" ");

export function AdminLayout() {
  const user = useUser();
  if (!user.isAdmin) return <Navigate to="/my" replace />;
  return (
    <div className="min-h-screen bg-surface flex">
      <aside className="w-60 shrink-0 bg-surface-tonal border-r border-border-subtle flex flex-col">
        <div className="px-4 h-14 flex items-center border-b border-border-subtle">
          <span className="font-semibold text-primary tracking-tight text-sm leading-tight">
            Talep Portalı
            <span className="block text-on-surface-variant font-normal text-xs">
              Yönetim
            </span>
          </span>
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-1">
          <NavLink to="/admin" end className={sideLink}>
            Tüm Talepler
          </NavLink>
          <NavLink to="/admin/tanimlar" className={sideLink}>
            Tanımlar
          </NavLink>
          <div className="mt-auto pt-3 border-t border-border-subtle">
            <NavLink
              to="/my"
              className="block px-3 py-2 rounded text-sm text-secondary hover:bg-surface-container"
            >
              ← Çalışan alanı
            </NavLink>
          </div>
        </nav>
        <div className="p-3 border-t border-border-subtle flex items-center justify-between gap-2">
          <span className="text-xs text-on-surface-variant truncate">
            {user.name || user.email}
          </span>
          <form method="post" action="/logout">
            <button
              type="submit"
              className="text-xs font-medium text-secondary hover:text-on-surface"
            >
              Çıkış
            </button>
          </form>
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
