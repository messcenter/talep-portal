// src/domain/stats.ts — pure dashboard aggregation (zero I/O).
import { isTerminal, type RequestStatus } from "./status";
import { PRIORITIES } from "./validation";

export const AGED_THRESHOLD_DAYS = 7;

/** Full elapsed days between two ISO timestamps, floored (>= 0 expected). */
export function ageInDays(lastActivityIso: string, nowIso: string): number {
  const ms = new Date(nowIso).getTime() - new Date(lastActivityIso).getTime();
  return Math.floor(ms / 86_400_000);
}

export type StatsRow = {
  id: number;
  request_no: string;
  title: string;
  status: RequestStatus;
  priority: string;
  created_at: string;
  last_activity_at: string;
};

export type AgedItem = {
  id: number;
  request_no: string;
  title: string;
  status: RequestStatus;
  age_days: number;
};

export type Priority = (typeof PRIORITIES)[number];

export type DashboardStats = {
  total: number;
  open: number;
  agedCount: number;
  byStatus: Record<RequestStatus, number>;
  openByPriority: Record<Priority, number>;
  aged: AgedItem[];
};

function isPriority(p: string): p is Priority {
  return (PRIORITIES as readonly string[]).includes(p);
}

export function buildDashboardStats(rows: StatsRow[], nowIso: string): DashboardStats {
  const byStatus: Record<RequestStatus, number> = {
    new: 0, clarifying: 0, answered: 0, accepted: 0, rejected: 0,
  };
  const openByPriority: Record<Priority, number> = { low: 0, medium: 0, high: 0 };
  const aged: AgedItem[] = [];

  for (const r of rows) {
    byStatus[r.status]++;
    if (isTerminal(r.status)) continue;
    if (isPriority(r.priority)) openByPriority[r.priority]++;
    const age = ageInDays(r.last_activity_at, nowIso);
    if (age >= AGED_THRESHOLD_DAYS) {
      aged.push({ id: r.id, request_no: r.request_no, title: r.title, status: r.status, age_days: age });
    }
  }

  aged.sort((a, b) => b.age_days - a.age_days);
  const open = byStatus.new + byStatus.clarifying + byStatus.answered;
  return { total: rows.length, open, agedCount: aged.length, byStatus, openByPriority, aged };
}
