// src/client/components/Subscribers.tsx
// Panel listing a request's subscribers (CC) with add/remove controls.
// Add: requester or admin. Remove: self-unsubscribe OR requester/admin.
import { useState } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { apiSend } from "../api";
import { useToast } from "./Toast";

export function Subscribers({
  requestId,
  subscribers,
  isSubscriber,
  canManage,
  currentEmail,
  onChanged,
}: {
  requestId: number;
  subscribers: { id: number; email: string }[];
  isSubscriber: boolean;
  canManage: boolean;
  currentEmail: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    const fd = new FormData();
    fd.set("email", email.trim());
    setSubmitting(true);
    try {
      await apiSend(`/api/requests/${requestId}/subscribers`, "POST", fd);
      setEmail("");
      toast.show("Takipçi eklendi.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(targetEmail: string) {
    const fd = new FormData();
    fd.set("email", targetEmail);
    try {
      await apiSend(`/api/requests/${requestId}/subscribers`, "DELETE", fd);
      toast.show("Takipçi kaldırıldı.");
      onChanged();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Kaldırılamadı.");
    }
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant mb-3">
        Takipçiler ({subscribers.length})
      </h3>

      {subscribers.length === 0 && (
        <p className="text-sm text-on-surface-variant mb-3">Henüz takipçi yok.</p>
      )}

      <ul className="mb-3 space-y-1">
        {subscribers.map((s) => {
          const isSelf = s.email.toLowerCase() === currentEmail.toLowerCase();
          return (
            <li key={s.id} className="flex items-center justify-between text-sm gap-2">
              <span className="text-on-surface truncate">{s.email}</span>
              {(canManage || isSelf) && (
                <button
                  type="button"
                  className="text-xs text-danger hover:underline shrink-0"
                  onClick={() => remove(s.email)}
                >
                  {isSelf ? "Takipten çık" : "Kaldır"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {canManage && (
        <form onSubmit={add} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="kurumsal e-posta"
            className="flex-1 rounded border border-border px-3 py-1.5 text-sm bg-surface"
            required
          />
          <Button type="submit" variant="primary" size="sm" disabled={submitting}>
            {submitting ? "…" : "Ekle"}
          </Button>
        </form>
      )}
      {error && <p role="alert" className="text-danger text-xs mt-2">{error}</p>}
      {!canManage && isSubscriber && (
        <p className="text-xs text-on-surface-variant">
          Bu talebin takipçisisiniz.
        </p>
      )}
    </Card>
  );
}
