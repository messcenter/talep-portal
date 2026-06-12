// src/domain/status.ts
export type RequestStatus =
  | "new"
  | "clarifying"
  | "answered"
  | "accepted"
  | "rejected";

const TERMINAL: ReadonlySet<RequestStatus> = new Set(["accepted", "rejected"]);

const ALLOWED: Record<RequestStatus, ReadonlySet<RequestStatus>> = {
  new: new Set(["clarifying", "accepted", "rejected"]),
  clarifying: new Set(["answered", "accepted", "rejected"]),
  answered: new Set(["clarifying", "accepted", "rejected"]),
  accepted: new Set(),
  rejected: new Set(),
};

const LABELS_TR: Record<RequestStatus, string> = {
  new: "Yeni",
  clarifying: "Netleştiriliyor",
  answered: "Cevaplandı",
  accepted: "Kabul edildi",
  rejected: "Reddedildi",
};

export function isTerminal(s: RequestStatus): boolean {
  return TERMINAL.has(s);
}

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return ALLOWED[from].has(to);
}

export function statusLabelTr(s: RequestStatus): string {
  return LABELS_TR[s];
}
