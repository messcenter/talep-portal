// src/client/pages/Admin.tsx
// "Admin Paneli - Tüm Talepler" — admin-only list of every request with status filter tabs.
import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { apiGet } from "../api";
import { useUser } from "../auth";
import { RequestCard, type RequestRow } from "../components/RequestCard";
import { statusLabelTr, type RequestStatus } from "../../domain/status";

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div
        className="w-7 h-7 rounded-full border-2 border-border-subtle border-t-primary animate-spin"
        role="status"
        aria-label="Yükleniyor"
      />
    </div>
  );
}

// "Hepsi" (no filter) + all statuses.
const STATUSES: RequestStatus[] = [
  "new",
  "clarifying",
  "answered",
  "accepted",
  "in_progress",
  "done",
  "rejected",
  "cancelled",
];

export function Admin() {
  const user = useUser();
  // Belt-and-suspenders: backend also 403s admin routes. The early return lives
  // here (no hooks below it) so AdminInner can call hooks unconditionally.
  if (!user.isAdmin) return <Navigate to="/my" replace />;
  return <AdminInner />;
}

function AdminInner() {
  // null = "Hepsi" (no status param)
  const [active, setActive] = useState<RequestStatus | null>(null);
  const [deptFilter, setDeptFilter] = useState<string>("");
  const [depts, setDepts] = useState<{ id: number; name: string }[]>([]);
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ id: number; name: string; modules: { id: number; name: string }[] }[]>(
      "/api/departments",
    )
      .then((d) => setDepts(d.map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    const params = new URLSearchParams();
    if (active) params.set("status", active);
    if (deptFilter) params.set("department", deptFilter);
    const qs = params.toString() ? `?${params.toString()}` : "";
    apiGet<RequestRow[]>(`/api/admin/requests${qs}`)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Bir hata oluştu.");
      });
    return () => {
      cancelled = true;
    };
  }, [active, deptFilter]);

  function tabClass(isActive: boolean): string {
    return [
      "text-xs font-medium px-3 py-1.5 rounded-full transition-colors",
      isActive
        ? "bg-primary text-primary-fg"
        : "bg-white border border-border-subtle text-on-surface-variant hover:bg-surface-tonal",
    ].join(" ");
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* Page heading */}
      <h1 className="text-2xl font-bold tracking-tight text-on-surface mb-4">
        Tüm Talepler
      </h1>

      {/* Status filter tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          type="button"
          className={tabClass(active === null)}
          onClick={() => setActive(null)}
        >
          Hepsi
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={tabClass(active === s)}
            onClick={() => setActive(s)}
          >
            {statusLabelTr(s)}
          </button>
        ))}
      </div>

      {/* Department filter */}
      {depts.length > 0 && (
        <div className="mb-6">
          <label htmlFor="dept-filter" className="sr-only">Departman filtresi</label>
          <select
            id="dept-filter"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="rounded border border-border bg-white px-3 py-1.5 text-sm text-on-surface"
          >
            <option value="">Tüm departmanlar</option>
            {depts.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* States */}
      {!rows && !error && <Spinner />}

      {error && (
        <div
          role="alert"
          className="bg-danger/10 border border-danger/30 text-danger rounded p-3 text-sm"
        >
          {error}
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="text-center py-16 text-on-surface-variant">Kayıt yok.</div>
      )}

      {rows && rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <RequestCard key={r.id} r={r} basePath="/admin/requests" />
          ))}
        </div>
      )}
    </main>
  );
}
