// src/client/pages/RequestDetail.tsx
// "Talep Detayı ve Yazışma" — shows request meta, clarification thread, and reply form.
import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { apiGet } from "../api";
import { useUser } from "../auth";
import { Card } from "../../components/ui/card";
import { type AttachmentRow } from "../components/Attachments";
import { Thread, type MessageRow } from "../components/Thread";
import { AdminControls } from "../components/AdminControls";
import { Spinner } from "../components/Spinner";
import { ReplyForm } from "../components/ReplyForm";
import { RequestMeta } from "../components/RequestMeta";
import type { RequestRow } from "../components/RequestCard";

// ---- Types ----

interface DetailData {
  request: RequestRow;
  messages: MessageRow[];
  attachments: AttachmentRow[];
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

  const isOwner =
    user.email.toLowerCase() === req.requester_email.toLowerCase();
  // The owner (even if also an admin) replies while clarifying.
  const canReply = isOwner && req.status === "clarifying";

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* ---- Meta card ---- */}
      <RequestMeta req={req} requestAtts={requestAtts} />

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

        {/* B4: admin controls — clarification form + accept/reject decision.
            Only for an admin acting on someone ELSE's request; an admin viewing
            their own request replies instead. */}
        {user.isAdmin && !isOwner && (
          <AdminControls requestId={req.id} status={req.status} onDone={load} />
        )}

        {/* Reply form — owner (incl. admin-owner), status === "clarifying" */}
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
