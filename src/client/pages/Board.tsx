// src/client/pages/Board.tsx
// Admin-only Kanban board: active requests grouped into status columns (read-only).
import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { apiGet } from "../api";
import { useUser } from "../auth";
import { statusLabelTr } from "../../domain/status";
import { RequestCard, type RequestRow } from "../components/RequestCard";
import { Spinner } from "../components/Spinner";
import { BOARD_COLUMNS, groupForBoard } from "../board";

export function Board() {
  const user = useUser();
  if (!user.isAdmin) return <Navigate to="/my" replace />;
  return <BoardInner />;
}

function BoardInner() {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<RequestRow[]>("/api/admin/requests")
      .then((d) => { if (!cancelled) setRows(d); })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Bir hata oluştu.");
      });
    return () => { cancelled = true; };
  }, []);

  const columns = rows ? groupForBoard(rows) : null;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-on-surface">Pano</h1>

      {error && (
        <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {!rows && !error && <Spinner />}

      {columns && (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {BOARD_COLUMNS.map((status, i) => (
            <section key={status} className="w-72 shrink-0">
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-on-surface">
                  {statusLabelTr(status)}
                </h2>
                <span className="rounded-full bg-surface-container px-2 py-0.5 text-xs font-medium tabular-nums text-on-surface-variant">
                  {columns[i].length}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {columns[i].length === 0 ? (
                  <p className="px-1 py-6 text-center text-sm text-on-surface-variant/70">—</p>
                ) : (
                  columns[i].map((r) => (
                    <RequestCard key={r.id} r={r} basePath="/admin/requests" showStatus={false} />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
