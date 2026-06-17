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
  test("returns one bucket per active status, all empty for empty input", () => {
    const cols = groupForBoard([]);
    expect(Object.keys(cols).sort()).toEqual([...BOARD_COLUMNS].sort());
    expect(BOARD_COLUMNS.every((s) => cols[s].length === 0)).toBe(true);
  });

  test("places each active row in its status column, leaving others empty", () => {
    const rows = [
      row({ id: 1, status: "new" }),
      row({ id: 2, status: "answered" }),
      row({ id: 3, status: "in_progress" }),
    ];
    const cols = groupForBoard(rows);
    expect(cols.new.map((r) => r.id)).toEqual([1]);
    expect(cols.answered.map((r) => r.id)).toEqual([2]);
    expect(cols.in_progress.map((r) => r.id)).toEqual([3]);
    expect(cols.clarifying).toEqual([]);
    expect(cols.accepted).toEqual([]);
  });

  test("drops terminal rows (done/rejected/cancelled)", () => {
    const rows = [
      row({ id: 1, status: "new" }),
      row({ id: 2, status: "done" }),
      row({ id: 3, status: "rejected" }),
      row({ id: 4, status: "cancelled" }),
    ];
    const cols = groupForBoard(rows);
    const total = BOARD_COLUMNS.reduce((n, s) => n + cols[s].length, 0);
    expect(total).toBe(1);
    expect(cols.new.map((r) => r.id)).toEqual([1]);
  });

  test("sorts a column by priority (high first), then oldest activity first", () => {
    const rows = [
      row({ id: 1, status: "new", priority: "low",  last_activity_at: "2026-06-02T00:00:00.000Z" }),
      row({ id: 2, status: "new", priority: "high", last_activity_at: "2026-06-05T00:00:00.000Z" }),
      row({ id: 3, status: "new", priority: "high", last_activity_at: "2026-06-03T00:00:00.000Z" }),
    ];
    const cols = groupForBoard(rows);
    expect(cols.new.map((r) => r.id)).toEqual([3, 2, 1]);
  });

  test("orders all three priority ranks: high < medium < low", () => {
    const rows = [
      row({ id: 1, status: "new", priority: "low" }),
      row({ id: 2, status: "new", priority: "high" }),
      row({ id: 3, status: "new", priority: "medium" }),
    ];
    const cols = groupForBoard(rows);
    expect(cols.new.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  test("falls back to created_at when last_activity_at is absent", () => {
    const rows = [
      row({ id: 1, status: "new", priority: "high", created_at: "2026-06-09T00:00:00.000Z", last_activity_at: undefined }),
      row({ id: 2, status: "new", priority: "high", created_at: "2026-06-01T00:00:00.000Z", last_activity_at: undefined }),
    ];
    const cols = groupForBoard(rows);
    expect(cols.new.map((r) => r.id)).toEqual([2, 1]);
  });
});
