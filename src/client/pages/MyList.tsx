// src/client/pages/MyList.tsx
// "Taleplerim" — the requester's own request list.
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import { Button } from "../../components/ui/button";
import { RequestCard, type RequestRow } from "../components/RequestCard";

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

export function MyList() {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<RequestRow[]>("/api/my")
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
  }, []);

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* Page heading */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">
          Taleplerim
        </h1>
        <Link to="/yeni">
          <Button variant="primary" size="sm">
            Yeni talep
          </Button>
        </Link>
      </div>

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
        <div className="text-center py-16 text-on-surface-variant">
          <p className="mb-3">Henüz talebiniz yok.</p>
          <Link
            to="/yeni"
            className="text-primary font-medium hover:underline"
          >
            Yeni talep oluşturun.
          </Link>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <RequestCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </main>
  );
}
