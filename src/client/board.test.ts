import { expect, test, describe } from "bun:test";
import { BOARD_COLUMNS, groupForBoard } from "./board";
import type { RequestRow } from "./components/RequestCard";

function row(over: Partial<RequestRow> & { id: number }): RequestRow {
  return {
    request_no: `T-${over.id}`,
    created_at: "2026-06-01T00:00:00.000Z",
    requester_name: "A",
    requester_email: "a@k.com",
    department: "d",
    application: "ERP",
    module_area: "",
    request_type: "feature",
    title: "t",
    description: "d",
    expected_benefit: "b",
    priority: "medium",
    status: "new",
    ...over,
  };
}

describe("BOARD_COLUMNS", () => {
  test("is exactly the 5 active statuses in workflow order", () => {
    expect(BOARD_COLUMNS).toEqual([
      "new", "clarifying", "answered", "accepted", "in_progress",
    ]);
  });
  test("contains no terminal status", () => {
    for (const t of ["done", "rejected", "cancelled"]) {
      expect(BOARD_COLUMNS).not.toContain(t);
    }
  });
});

describe("groupForBoard", () => {
  test("returns one bucket per column, aligned to BOARD_COLUMNS", () => {
    const cols = groupForBoard([]);
    expect(cols.length).toBe(BOARD_COLUMNS.length);
    expect(cols.every((c) => c.length === 0)).toBe(true);
  });

  test("places each active row in its status column", () => {
    const rows = [
      row({ id: 1, status: "new" }),
      row({ id: 2, status: "answered" }),
      row({ id: 3, status: "in_progress" }),
    ];
    const cols = groupForBoard(rows);
    expect(cols[0].map((r) => r.id)).toEqual([1]); // new
    expect(cols[2].map((r) => r.id)).toEqual([2]); // answered
    expect(cols[4].map((r) => r.id)).toEqual([3]); // in_progress
  });

  test("drops terminal rows (done/rejected/cancelled)", () => {
    const rows = [
      row({ id: 1, status: "new" }),
      row({ id: 2, status: "done" }),
      row({ id: 3, status: "rejected" }),
      row({ id: 4, status: "cancelled" }),
    ];
    const cols = groupForBoard(rows);
    const total = cols.reduce((n, c) => n + c.length, 0);
    expect(total).toBe(1);
    expect(cols[0].map((r) => r.id)).toEqual([1]);
  });

  test("sorts a column by priority (high first), then oldest activity first", () => {
    const rows = [
      row({ id: 1, status: "new", priority: "low",  last_activity_at: "2026-06-02T00:00:00.000Z" }),
      row({ id: 2, status: "new", priority: "high", last_activity_at: "2026-06-05T00:00:00.000Z" }),
      row({ id: 3, status: "new", priority: "high", last_activity_at: "2026-06-03T00:00:00.000Z" }),
    ];
    const cols = groupForBoard(rows);
    expect(cols[0].map((r) => r.id)).toEqual([3, 2, 1]);
  });

  test("falls back to created_at when last_activity_at is absent", () => {
    const rows = [
      row({ id: 1, status: "new", priority: "high", created_at: "2026-06-09T00:00:00.000Z", last_activity_at: undefined }),
      row({ id: 2, status: "new", priority: "high", created_at: "2026-06-01T00:00:00.000Z", last_activity_at: undefined }),
    ];
    const cols = groupForBoard(rows);
    expect(cols[0].map((r) => r.id)).toEqual([2, 1]);
  });
});
