// src/client/components/Thread.tsx
// Renders the clarification Q&A thread between admin and requester.
import { Attachments, type AttachmentRow } from "./Attachments";
import { MarkdownView } from "./MarkdownView";

export interface MessageRow {
  id: number;
  request_id: number;
  author_role: "admin" | "requester";
  body: string;
  created_at: string;
}

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function Thread({
  messages,
  attachmentsByMessage,
  requestId,
}: {
  messages: MessageRow[];
  attachmentsByMessage: Map<number, AttachmentRow[]>;
  requestId: number;
}) {
  if (messages.length === 0) {
    return (
      <p className="text-sm text-on-surface-variant italic">
        Henüz mesaj yok.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map((msg) => {
        const isAdmin = msg.author_role === "admin";
        const msgAtts = attachmentsByMessage.get(msg.id) ?? [];

        return (
          <div key={msg.id} className={isAdmin ? "" : "pl-8"}>
            {/* Label + timestamp */}
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                {isAdmin ? "Yönetici (soru)" : "Talep eden (cevap)"}
              </span>
              <span className="font-mono text-xs text-on-surface-variant/70">
                {formatTs(msg.created_at)}
              </span>
            </div>

            {/* Message bubble */}
            <div
              className={[
                "rounded border p-3 text-sm",
                isAdmin
                  ? "bg-surface-tonal border-border-subtle text-on-surface"
                  : "bg-primary/5 border-primary/20 text-on-surface",
              ].join(" ")}
            >
              <MarkdownView source={msg.body} />
            </div>

            {/* Message attachments */}
            {msgAtts.length > 0 && (
              <Attachments requestId={requestId} attachments={msgAtts} />
            )}
          </div>
        );
      })}
    </div>
  );
}
