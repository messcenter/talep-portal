// src/client/pages/Dashboard.tsx
// Admin-only özet paneli: sağlık sayıları + durum/öncelik kırılımı + yaşlanan triyaj.
import { useState, useEffect } from "react";
import { Navigate, Link } from "react-router-dom";
import { apiGet } from "../api";
import { useUser } from "../auth";
import { statusLabelTr, type RequestStatus } from "../../domain/status";
import { PRIORITY_LABEL } from "../labels";
import { StatusBadge } from "../components/StatusBadge";

type Priority = "low" | "medium" | "high";

type AgedItem = {
  id: number;
  request_no: string;
  title: string;
  status: RequestStatus;
  age_days: number;
};

type DashboardStats = {
  total: number;
  open: number;
  agedCount: number;
  byStatus: Record<RequestStatus, number>;
  openByPriority: Record<Priority, number>;
  aged: AgedItem[];
};

const STATUS_ORDER: RequestStatus[] = ["new", "clarifying", "answered", "accepted", "rejected"];
const STATUS_BAR: Record<RequestStatus, string> = {
  new: "bg-status-yeni",
  clarifying: "bg-status-netlestiriliyor",
  answered: "bg-status-netlestiriliyor",
  accepted: "bg-status-kabul",
  rejected: "bg-status-ret",
};

const PRIORITY_ORDER: Priority[] = ["high", "medium", "low"];
const PRIORITY_BAR: Record<Priority, string> = {
  high: "bg-danger",
  medium: "bg-status-netlestiriliyor",
  low: "bg-on-surface-variant",
};

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

function NumCard({ n, label, alert = false }: { n: number; label: string; alert?: boolean }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-white px-4 py-3">
      <div className={`text-2xl font-bold leading-none ${alert ? "text-danger" : "text-on-surface"}`}>
        {n}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-on-surface-variant">{label}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border-subtle bg-white p-4">
      <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="my-1.5 flex items-center gap-3">
      <span className="w-32 shrink-0 text-sm text-on-surface">{label}</span>
      <span className="h-3.5 flex-1 overflow-hidden rounded bg-surface-container">
        <span className={`block h-full rounded ${color}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="w-7 text-right text-sm font-semibold tabular-nums text-on-surface">{value}</span>
    </div>
  );
}

export function Dashboard() {
  const user = useUser();
  if (!user.isAdmin) return <Navigate to="/my" replace />;
  return <DashboardInner />;
}

function DashboardInner() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<DashboardStats>("/api/admin/stats")
      .then((d) => { if (!cancelled) setStats(d); })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Bir hata oluştu.");
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-on-surface">Özet</h1>

      {error && (
        <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {!stats && !error && <Spinner />}

      {stats && (
        <>
          <div className="mb-6 grid grid-cols-3 gap-3">
            <NumCard n={stats.total} label="Toplam" />
            <NumCard n={stats.open} label="Açık" />
            <NumCard n={stats.agedCount} label="7g+ Bekleyen" alert />
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <Panel title="Durum dağılımı">
              {STATUS_ORDER.map((s) => (
                <Bar
                  key={s}
                  label={statusLabelTr(s)}
                  value={stats.byStatus[s]}
                  max={Math.max(1, ...STATUS_ORDER.map((x) => stats.byStatus[x]))}
                  color={STATUS_BAR[s]}
                />
              ))}
            </Panel>
            <Panel title="Öncelik (açık talepler)">
              {PRIORITY_ORDER.map((p) => (
                <Bar
                  key={p}
                  label={PRIORITY_LABEL[p]}
                  value={stats.openByPriority[p]}
                  max={Math.max(1, ...PRIORITY_ORDER.map((x) => stats.openByPriority[x]))}
                  color={PRIORITY_BAR[p]}
                />
              ))}
            </Panel>
          </div>

          <Panel title="Dikkat bekleyen (7+ gün hareketsiz)">
            {stats.aged.length === 0 ? (
              <p className="py-2 text-sm text-on-surface-variant">Bekleyen yok.</p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {stats.aged.map((a) => (
                  <li key={a.id}>
                    <Link
                      to={`/admin/requests/${a.id}`}
                      className="flex items-center gap-3 rounded px-1 py-2 hover:bg-surface-container"
                    >
                      <span className="w-20 shrink-0 font-semibold text-primary">{a.request_no}</span>
                      <span className="flex-1 truncate text-sm text-on-surface">{a.title}</span>
                      <StatusBadge status={a.status} />
                      <span className="whitespace-nowrap text-sm font-semibold text-danger">
                        {a.age_days}g
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </main>
  );
}
