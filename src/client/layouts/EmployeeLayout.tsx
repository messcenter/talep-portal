// src/client/layouts/EmployeeLayout.tsx
// Employee-facing chrome: top header with brand + nav + user/logout.
import { NavLink, Outlet } from "react-router-dom";
import { useUser } from "../auth";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "text-sm font-medium px-3 py-1 rounded transition-colors",
    isActive
      ? "bg-primary text-primary-fg"
      : "text-primary hover:bg-surface-container",
  ].join(" ");

export function EmployeeLayout() {
  const user = useUser();
  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-white border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <NavLink
            to="/my"
            className="font-semibold text-primary tracking-tight text-base"
          >
            Talep Portalı
          </NavLink>
          <nav className="flex items-center gap-1">
            <NavLink to="/my" className={linkClass}>
              Taleplerim
            </NavLink>
            <NavLink to="/yeni" className={linkClass}>
              Yeni Talep
            </NavLink>
            {user.isAdmin && (
              <>
                <span
                  className="mx-1 h-5 w-px bg-border-subtle"
                  aria-hidden="true"
                />
                <NavLink to="/admin" className={linkClass}>
                  Yönetim →
                </NavLink>
              </>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-xs text-on-surface-variant hidden sm:block truncate max-w-[160px]">
              {user.name || user.email}
            </span>
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
      <Outlet />
    </div>
  );
}
