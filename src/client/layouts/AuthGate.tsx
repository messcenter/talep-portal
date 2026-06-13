// src/client/layouts/AuthGate.tsx
// Loads /api/me, provides UserContext, renders <Outlet/> (no chrome — layouts add it).
import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { apiGet } from "../api";
import { UserContext, type User } from "../auth";

export function AuthGate() {
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

  if (loading)
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-3">
        <div
          className="w-8 h-8 rounded-full border-2 border-border-subtle border-t-primary animate-spin"
          role="status"
          aria-label="Yükleniyor"
        />
        <span className="text-sm text-on-surface-variant">Yükleniyor…</span>
      </div>
    );
  if (!user) return null; // redirect in flight

  return (
    <UserContext.Provider value={user}>
      <Outlet />
    </UserContext.Provider>
  );
}
