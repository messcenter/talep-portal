// src/client/pages/RequestDetail.tsx
// "Talep Detayı ve Yazışma" — shows request meta, clarification thread, and reply form.
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { apiGet, apiSend } from "../api";
import { useUser } from "../auth";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { StatusBadge } from "../components/StatusBadge";
import { Attachments, type AttachmentRow } from "../components/Attachments";
import { Thread, type MessageRow } from "../components/Thread";
import { AdminControls } from "../components/AdminControls";
import { PRIORITY_LABEL } from "../labels";
import type { RequestRow } from "../components/RequestCard";

// ---- Types ----

interface DetailData {
  request: RequestRow;
  messages: MessageRow[];
  attachments: AttachmentRow[];
}

// ---- Shared helpers ----

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

const inputClass =
  "block w-full rounded border border-border-subtle bg-white px-3 py-2 text-sm text-on-surface " +
  "placeholder:text-on-surface-variant/50 " +
  "focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary " +
  "disabled:opacity-50 disabled:bg-surface-tonal";

const fileInputClass =
  "block w-full text-sm text-on-surface-variant " +
  "file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-border-subtle " +
  "file:text-xs file:font-semibold file:uppercase file:tracking-wide " +
  "file:text-on-surface-variant file:bg-surface-tonal file:cursor-pointer " +
  "hover:file:bg-surface-container disabled:opacity-50";

// ---- Reply form (requester only, status === "clarifying") ----

function ReplyForm({
  requestId,
  onSuccess,
}: {
  requestId: number;
  onSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;

    setSubmitting(true);
    setErrorMsg(null);

    const fd = new FormData(formRef.current);

    try {
      await apiSend(`/api/requests/${requestId}/reply`, "POST", fd);
      formRef.current.reset();
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.";
      // Surface 403 distinctly
      if (msg === "HTTP 403" || msg.includes("403")) {
        setErrorMsg("Bu talebe şu anda cevap verme izniniz yok.");
      } else {
        setErrorMsg(msg);
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant mb-3">
        Cevapla
      </h2>

      {errorMsg && (
        <div
          role="alert"
          className="mb-4 bg-danger/10 border border-danger/30 text-danger rounded p-3 text-sm"
        >
          {errorMsg}
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} noValidate>
        <div className="mb-3">
          <textarea
            name="body"
            required
            rows={4}
            placeholder="Cevabınızı buraya yazın…"
            className={inputClass + " resize-y"}
            disabled={submitting}
          />
        </div>

        <div className="mb-4">
          <input
            name="files"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            className={fileInputClass}
            disabled={submitting}
          />
          <p className="text-xs text-on-surface-variant mt-1">
            PNG, JPEG, WebP, GIF veya PDF · İsteğe bağlı
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
            {submitting ? "Gönderiliyor…" : "Cevapla"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ---- Main page ----

export function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();

  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    apiGet<DetailData>(`/api/requests/${id}`)
      .then((d) => setData(d))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "404") {
          setNotFound(true);
        } else {
          setError(msg);
        }
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- Loading ----
  if (!data && !error && !notFound) return <Spinner />;

  // ---- Not found ----
  if (notFound) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="text-center py-16 text-on-surface-variant">
          Talep bulunamadı.
        </div>
      </main>
    );
  }

  // ---- Error ----
  if (error) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div
          role="alert"
          className="bg-danger/10 border border-danger/30 text-danger rounded p-3 text-sm"
        >
          {error}
        </div>
      </main>
    );
  }

  if (!data) return null;

  const { request: req, messages, attachments } = data;

  // Partition attachments: request-level (message_id null) vs message-level
  const requestAtts = attachments.filter((a) => a.message_id === null);
  const attachmentsByMessage = new Map<number, AttachmentRow[]>();
  for (const att of attachments) {
    if (att.message_id !== null) {
      const bucket = attachmentsByMessage.get(att.message_id) ?? [];
      bucket.push(att);
      attachmentsByMessage.set(att.message_id, bucket);
    }
  }

  // canReply mirrors src/domain/authz.ts canReply:
  //   !isAdmin && email matches && status === "clarifying"
  const canReply =
    !user.isAdmin &&
    user.email.toLowerCase() === req.requester_email.toLowerCase() &&
    req.status === "clarifying";

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* ---- Meta card ---- */}
      <Card className="p-4 mb-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h1 className="font-mono text-primary text-base font-semibold">
              {req.request_no}
            </h1>
            <p className="text-on-surface font-medium text-lg leading-snug mt-0.5">
              {req.title}
            </p>
          </div>
          <StatusBadge status={req.status} />
        </div>

        {/* Sub-line */}
        <div className="flex flex-wrap items-center gap-2 text-sm text-on-surface-variant mb-4">
          <span>{PRIORITY_LABEL[req.priority] ?? req.priority}</span>
          <span>·</span>
          <span>{req.department}</span>
          <span>·</span>
          <span>{req.application}</span>
          {req.module_area && (
            <>
              <span>·</span>
              <span>{req.module_area}</span>
            </>
          )}
        </div>

        {/* Description */}
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-1">
            Açıklama
          </p>
          <p className="text-sm text-on-surface whitespace-pre-wrap">
            {req.description}
          </p>
        </div>

        {/* Expected benefit */}
        <div className="mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-1">
            Beklenen Fayda
          </p>
          <p className="text-sm text-on-surface whitespace-pre-wrap">
            {req.expected_benefit}
          </p>
        </div>

        {/* Request-level attachments */}
        {requestAtts.length > 0 && (
          <Attachments requestId={req.id} attachments={requestAtts} />
        )}
      </Card>

      {/* ---- Thread card ---- */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant mb-4">
          Yazışma
        </h2>

        <Thread
          messages={messages}
          attachmentsByMessage={attachmentsByMessage}
          requestId={req.id}
        />

        {/* B4: admin controls — clarification form + accept/reject decision */}
        {user.isAdmin && (
          <AdminControls requestId={req.id} status={req.status} onDone={load} />
        )}

        {/* Reply form — requester only, status === "clarifying" */}
        {canReply && (
          <>
            <div className="border-t border-border-subtle mt-6" />
            <ReplyForm requestId={req.id} onSuccess={load} />
          </>
        )}
      </Card>
    </main>
  );
}
