// src/client/board.ts
// Pure grouping/sorting logic for the admin Kanban board.
// Kept free of React/DOM imports (type-only) so it unit-tests without a DOM.
import { type RequestStatus } from "../domain/status";
import type { RequestRow } from "./components/RequestCard";

/** Active (non-terminal) statuses shown as board columns, in workflow order. */
export const BOARD_COLUMNS = [
  "new",
  "clarifying",
  "answered",
  "accepted",
  "in_progress",
] as const satisfies readonly RequestStatus[];

/** One of the active statuses rendered as a board column. */
export type BoardStatus = (typeof BOARD_COLUMNS)[number];

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function activityKey(r: RequestRow): string {
  return r.last_activity_at ?? r.created_at;
}

/** priority (high→low), then oldest activity first (stale surfaces to top). */
function boardSort(a: RequestRow, b: RequestRow): number {
  const pa = PRIORITY_RANK[a.priority] ?? 3;
  const pb = PRIORITY_RANK[b.priority] ?? 3;
  if (pa !== pb) return pa - pb;
  // ISO-8601 UTC strings: lexicographic order == chronological. Plain compare
  // is locale-independent (unlike localeCompare) and faster.
  const ka = activityKey(a);
  const kb = activityKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * Group rows into one sorted bucket keyed by each active board status.
 * Keyed (not positional) so callers read `columns[status]` — no index coupling.
 * Terminal/unknown statuses are dropped (no key for them).
 */
export function groupForBoard(rows: RequestRow[]): Record<BoardStatus, RequestRow[]> {
  const columns = {} as Record<BoardStatus, RequestRow[]>;
  for (const status of BOARD_COLUMNS) {
    columns[status] = rows.filter((r) => r.status === status).sort(boardSort);
  }
  return columns;
}
