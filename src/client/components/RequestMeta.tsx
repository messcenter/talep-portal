import { Card } from "../../components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { Attachments, type AttachmentRow } from "./Attachments";
import { MarkdownView } from "./MarkdownView";
import { PRIORITY_LABEL } from "../labels";
import type { RequestRow } from "./RequestCard";

export function RequestMeta({
  req,
  requestAtts,
  relatedDepartments,
  showRequester = false,
}: {
  req: RequestRow;
  requestAtts: AttachmentRow[];
  relatedDepartments?: string[];
  showRequester?: boolean;
}) {
  return (
    <Card className="p-4 mb-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h1 className="font-mono text-primary text-base font-semibold">{req.request_no}</h1>
          <p className="text-on-surface font-medium text-lg leading-snug mt-0.5">{req.title}</p>
        </div>
        <StatusBadge status={req.status} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-on-surface-variant mb-4">
        <span>{PRIORITY_LABEL[req.priority] ?? req.priority}</span>
        <span>·</span><span>{req.department}</span>
        <span>·</span><span>{req.application}</span>
        {req.module_area && (<><span>·</span><span>{req.module_area}</span></>)}
        {showRequester && (
          <>
            <span>·</span>
            <span>Açan: <span className="text-on-surface">{req.requester_name}</span> ({req.requester_email})</span>
          </>
        )}
      </div>
      {relatedDepartments && relatedDepartments.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <span className="text-xs text-on-surface-variant">İlgili:</span>
          {relatedDepartments.map((d) => (
            <span
              key={d}
              className="text-xs px-2 py-0.5 rounded-full bg-surface-tonal border border-border-subtle text-on-surface"
            >
              {d}
            </span>
          ))}
        </div>
      )}
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-1">Açıklama</p>
        <MarkdownView source={req.description} />
      </div>
      <div className="mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-1">Beklenen Fayda</p>
        <MarkdownView source={req.expected_benefit} />
      </div>
      {requestAtts.length > 0 && <Attachments requestId={req.id} attachments={requestAtts} />}
    </Card>
  );
}
