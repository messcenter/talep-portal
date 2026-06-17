// src/domain/stats.test.ts
import { expect, test, describe } from "bun:test";
import {
  ageInDays,
  AGED_THRESHOLD_DAYS,
  buildDashboardStats,
  type StatsRow,
} from "./stats";

describe("ageInDays", () => {
  test("counts whole elapsed days, floored", () => {
    expect(ageInDays("2026-06-01T00:00:00.000Z", "2026-06-08T00:00:00.000Z")).toBe(7);
    expect(ageInDays("2026-06-01T00:00:00.000Z", "2026-06-08T23:59:59.000Z")).toBe(7);
    expect(ageInDays("2026-06-01T00:00:00.000Z", "2026-06-01T05:00:00.000Z")).toBe(0);
  });

  test("threshold constant is 7", () => {
    expect(AGED_THRESHOLD_DAYS).toBe(7);
  });
});

const NOW = "2026-06-13T00:00:00.000Z";

function row(over: Partial<StatsRow>): StatsRow {
  return {
    id: 1,
    request_no: "TLP-0001",
    title: "Başlık",
    status: "new",
    priority: "medium",
    created_at: "2026-06-13T00:00:00.000Z",
    last_activity_at: "2026-06-13T00:00:00.000Z",
    ...over,
  };
}

describe("buildDashboardStats", () => {
  test("empty input → all zeros, empty aged", () => {
    const s = buildDashboardStats([], NOW);
    expect(s.total).toBe(0);
    expect(s.open).toBe(0);
    expect(s.agedCount).toBe(0);
    expect(s.byStatus).toEqual({ new: 0, clarifying: 0, answered: 0, accepted: 0, in_progress: 0, done: 0, rejected: 0, cancelled: 0 });
    expect(s.openByPriority).toEqual({ low: 0, medium: 0, high: 0 });
    expect(s.aged).toEqual([]);
  });

  test("counts every status; total = row count", () => {
    const s = buildDashboardStats(
      [
        row({ id: 1, status: "new" }),
        row({ id: 2, status: "clarifying" }),
        row({ id: 3, status: "answered" }),
        row({ id: 4, status: "accepted" }),
        row({ id: 5, status: "rejected" }),
      ],
      NOW,
    );
    expect(s.total).toBe(5);
    expect(s.byStatus).toEqual({ new: 1, clarifying: 1, answered: 1, accepted: 1, in_progress: 0, done: 0, rejected: 1, cancelled: 0 });
    expect(s.open).toBe(3); // new + clarifying + answered (accepted/in_progress are execution-phase, not "open for clarification")
  });

  test("openByPriority counts only non-terminal requests", () => {
    const s = buildDashboardStats(
      [
        row({ id: 1, status: "new", priority: "high" }),
        row({ id: 2, status: "clarifying", priority: "medium" }),
        row({ id: 3, status: "accepted", priority: "high" }), // non-terminal → included
        row({ id: 4, status: "rejected", priority: "high" }), // terminal → excluded
      ],
      NOW,
    );
    expect(s.openByPriority).toEqual({ low: 0, medium: 1, high: 2 });
  });

  test("aged: only open rows past threshold; boundary is >= 7 days", () => {
    const s = buildDashboardStats(
      [
        row({ id: 1, status: "new", last_activity_at: "2026-06-06T00:00:00.000Z" }), // 7 days → aged
        row({ id: 2, status: "clarifying", last_activity_at: "2026-06-07T00:00:00.000Z" }), // 6 days → not
        row({ id: 3, status: "rejected", last_activity_at: "2026-01-01T00:00:00.000Z" }), // terminal → excluded
      ],
      NOW,
    );
    expect(s.agedCount).toBe(1);
    expect(s.aged.map((a) => a.id)).toEqual([1]);
    expect(s.aged[0]).toEqual({ id: 1, request_no: "TLP-0001", title: "Başlık", status: "new", age_days: 7 });
  });

  test("aged sorted by age descending", () => {
    const s = buildDashboardStats(
      [
        row({ id: 1, status: "new", last_activity_at: "2026-06-01T00:00:00.000Z" }), // 12 days
        row({ id: 2, status: "answered", last_activity_at: "2026-06-05T00:00:00.000Z" }), // 8 days
        row({ id: 3, status: "clarifying", last_activity_at: "2026-05-20T00:00:00.000Z" }), // 24 days
      ],
      NOW,
    );
    expect(s.aged.map((a) => a.id)).toEqual([3, 1, 2]);
  });

  test("unknown status value does not poison known status counts", () => {
    const s = buildDashboardStats([row({ status: "weird" as any })], NOW);
    expect(s.total).toBe(1);
    expect(s.byStatus).toEqual({ new: 0, clarifying: 0, answered: 0, accepted: 0, in_progress: 0, done: 0, rejected: 0, cancelled: 0 });
  });

  test("new statuses are counted in byStatus and excluded from open", () => {
    const rows: StatsRow[] = [
      { id: 1, request_no: "T-1", title: "a", status: "in_progress", priority: "low",
        created_at: "2026-06-01T00:00:00.000Z", last_activity_at: "2026-06-01T00:00:00.000Z" },
      { id: 2, request_no: "T-2", title: "b", status: "done", priority: "low",
        created_at: "2026-06-01T00:00:00.000Z", last_activity_at: "2026-06-01T00:00:00.000Z" },
      { id: 3, request_no: "T-3", title: "c", status: "cancelled", priority: "low",
        created_at: "2026-06-01T00:00:00.000Z", last_activity_at: "2026-06-01T00:00:00.000Z" },
    ];
    const s = buildDashboardStats(rows, "2026-06-17T00:00:00.000Z");
    expect(s.byStatus.in_progress).toBe(1);
    expect(s.byStatus.done).toBe(1);
    expect(s.byStatus.cancelled).toBe(1);
    expect(s.open).toBe(0); // in_progress/done/cancelled are not new/clarifying/answered
  });
});
