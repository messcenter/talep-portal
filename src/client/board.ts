// src/client/board.ts
// Pure grouping/sorting logic for the admin Kanban board.
// Kept free of React/DOM imports (type-only) so it unit-tests without a DOM.
import { type RequestStatus } from "../domain/status";
import type { RequestRow } from "./components/RequestCard";

/** Active (non-terminal) statuses shown as board columns, in workflow order. */
export const BOARD_COLUMNS: RequestStatus[] = [
  "new",
  "clarifying",
  "answered",
  "accepted",
  "in_progress",
];

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function activityKey(r: RequestRow): string {
  return r.last_activity_at ?? r.created_at;
}

/** priority (high→low), then oldest activity first (stale surfaces to top). */
function boardSort(a: RequestRow, b: RequestRow): number {
  const pa = PRIORITY_RANK[a.priority] ?? 3;
  const pb = PRIORITY_RANK[b.priority] ?? 3;
  if (pa !== pb) return pa - pb;
  return activityKey(a).localeCompare(activityKey(b));
}

/**
 * Group rows into one sorted bucket per BOARD_COLUMNS entry (index-aligned).
 * Terminal/unknown statuses are dropped.
 */
export function groupForBoard(rows: RequestRow[]): RequestRow[][] {
  return BOARD_COLUMNS.map((status) =>
    rows.filter((r) => r.status === status).sort(boardSort),
  );
}
