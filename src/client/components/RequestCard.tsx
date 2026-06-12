// src/client/components/RequestCard.tsx
// Compact summary card for a single request; used in the MyList page.
import { Link } from "react-router-dom";
import { StatusBadge } from "./StatusBadge";
import { PRIORITY_LABEL } from "../labels";
import type { RequestStatus } from "../../domain/status";

export interface RequestRow {
  id: number;
  request_no: string;
  created_at: string;
  requester_name: string;
  requester_email: string;
  department: string;
  application: string;
  module_area: string | null;
  request_type: string;
  title: string;
  description: string;
  expected_benefit: string;
  priority: string;
  status: RequestStatus;
}

export function RequestCard({ r }: { r: RequestRow }) {
  return (
    <Link
      to={`/requests/${r.id}`}
      className="block border border-border-subtle rounded-lg p-4 bg-white hover:bg-surface-tonal transition-colors no-underline"
    >
      {/* Top row: request_no + title | StatusBadge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="font-mono text-sm text-primary shrink-0">
            {r.request_no}
          </span>
          <span className="text-on-surface-variant text-sm shrink-0">·</span>
          <span className="font-medium text-on-surface text-sm truncate">
            {r.title}
          </span>
        </div>
        <StatusBadge status={r.status} />
      </div>

      {/* Second row: priority · application */}
      <div className="mt-1.5 flex items-center gap-1.5 text-sm text-on-surface-variant">
        <span>{PRIORITY_LABEL[r.priority] ?? r.priority}</span>
        <span>·</span>
        <span>{r.application}</span>
        {r.module_area && (
          <>
            <span>·</span>
            <span>{r.module_area}</span>
          </>
        )}
      </div>
    </Link>
  );
}
