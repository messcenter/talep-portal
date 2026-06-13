import { Card } from "../../components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { Attachments, type AttachmentRow } from "./Attachments";
import { MarkdownView } from "./MarkdownView";
import { PRIORITY_LABEL } from "../labels";
import type { RequestRow } from "./RequestCard";

export function RequestMeta({ req, requestAtts }: { req: RequestRow; requestAtts: AttachmentRow[] }) {
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
      </div>
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
