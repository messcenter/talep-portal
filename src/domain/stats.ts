// src/domain/stats.ts — pure dashboard aggregation (zero I/O).
import { isTerminal, type RequestStatus } from "./status";

export const AGED_THRESHOLD_DAYS = 7;

/** Full elapsed days between two ISO timestamps, floored (>= 0 expected). */
export function ageInDays(lastActivityIso: string, nowIso: string): number {
  const ms = new Date(nowIso).getTime() - new Date(lastActivityIso).getTime();
  return Math.floor(ms / 86_400_000);
}
