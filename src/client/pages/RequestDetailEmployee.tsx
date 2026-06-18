// src/client/pages/RequestDetailEmployee.tsx
// Employee (owner/reply) view of a single request.
import { useParams } from "react-router-dom";
import { useUser } from "../auth";
import { Card } from "../../components/ui/card";
import { Spinner } from "../components/Spinner";
import { RequestMeta } from "../components/RequestMeta";
import { Thread } from "../components/Thread";
import { ReplyForm } from "../components/ReplyForm";
import { Subscribers } from "../components/Subscribers";
import { type AttachmentRow } from "../components/Attachments";
import { useRequestDetail } from "../hooks/useRequestDetail";

function partition(attachments: AttachmentRow[]) {
  const requestAtts = attachments.filter((a) => a.message_id === null);
  const byMsg = new Map<number, AttachmentRow[]>();
  for (const a of attachments) {
    if (a.message_id !== null) {
      const b = byMsg.get(a.message_id) ?? [];
      b.push(a);
      byMsg.set(a.message_id, b);
    }
  }
  return { requestAtts, byMsg };
}

export function RequestDetailEmployee() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const { data, error, notFound, load } = useRequestDetail(id);

  if (!data && !error && !notFound)
    return (
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Spinner />
      </main>
    );
  if (notFound)
    return (
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="text-center py-16 text-on-surface-variant">
          Talep bulunamadı.
        </div>
      </main>
    );
  if (error)
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
  if (!data) return null;

  const { request: req, messages } = data;
  const { requestAtts, byMsg } = partition(data.attachments);
  const isOwner =
    user.email.toLowerCase() === req.requester_email.toLowerCase();
  const canReply = isOwner && req.status === "clarifying";

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      <RequestMeta req={req} requestAtts={requestAtts} relatedDepartments={data.related_departments} />
      <Card className="p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant mb-4">
          Yazışma
        </h2>
        <Thread
          messages={messages}
          attachmentsByMessage={byMsg}
          requestId={req.id}
        />
        {canReply && (
          <>
            <div className="border-t border-border-subtle mt-6" />
            <ReplyForm requestId={req.id} onSuccess={load} />
          </>
        )}
      </Card>
      <div className="mt-4">
        <Subscribers
          requestId={req.id}
          subscribers={data.subscribers}
          isSubscriber={data.isSubscriber}
          canManage={isOwner || user.isAdmin}
          currentEmail={user.email}
          onChanged={load}
        />
      </div>
    </main>
  );
}
