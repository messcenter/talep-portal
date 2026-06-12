// src/client/components/Attachments.tsx
// Renders a list of attachments: images inline, others as bordered download links.

export interface AttachmentRow {
  id: number;
  request_id: number;
  message_id: number | null;
  storage_key: string;
  original_name: string;
  mime: string;
  size_bytes: number;
  created_at: string;
}

function attachmentUrl(requestId: number, attId: number): string {
  return `/requests/${requestId}/attachments/${attId}`;
}

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

export function Attachments({
  requestId,
  attachments,
}: {
  requestId: number;
  attachments: AttachmentRow[];
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {attachments.map((att) => {
        const url = attachmentUrl(requestId, att.id);
        if (isImage(att.mime)) {
          return (
            <a
              key={att.id}
              href={url}
              target="_blank"
              rel="noreferrer"
              title={att.original_name}
            >
              <img
                src={url}
                alt={att.original_name}
                className="h-24 w-24 object-cover border border-border-subtle rounded"
              />
            </a>
          );
        }
        return (
          <a
            key={att.id}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 border border-border-subtle rounded px-3 py-1.5 text-sm text-on-surface hover:bg-surface-tonal transition-colors"
          >
            📄 {att.original_name}
          </a>
        );
      })}
    </div>
  );
}
