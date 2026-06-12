// src/domain/authz.ts
import type { RequestStatus } from "./status";

export type User = { email: string; name: string; isAdmin: boolean };
export type RequestRef = {
  requester_email: string;
  status: RequestStatus;
};

export function isAdmin(email: string, adminEmails: string[]): boolean {
  return adminEmails.includes(email.trim().toLowerCase());
}

export function canViewRequest(user: User, req: RequestRef): boolean {
  if (user.isAdmin) return true;
  return user.email.toLowerCase() === req.requester_email.toLowerCase();
}

export function canReply(user: User, req: RequestRef): boolean {
  if (user.isAdmin) return false;
  if (user.email.toLowerCase() !== req.requester_email.toLowerCase())
    return false;
  return req.status === "clarifying";
}
