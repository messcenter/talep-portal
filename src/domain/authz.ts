// src/domain/authz.ts
import type { RequestStatus } from "./status";

export type User = { email: string; name: string; isAdmin: boolean };
export type RequestRef = {
  requester_email: string;
  status: RequestStatus;
};

export function isAdmin(email: string, adminEmails: string[]): boolean {
  const target = email.trim().toLowerCase();
  return adminEmails.some((a) => a.trim().toLowerCase() === target);
}

export function canViewRequest(
  user: User,
  req: RequestRef,
  isSubscriber: boolean = false,
): boolean {
  if (user.isAdmin) return true;
  if (user.email.toLowerCase() === req.requester_email.toLowerCase()) return true;
  return isSubscriber;
}

export function canReply(user: User, req: RequestRef): boolean {
  if (user.email.toLowerCase() !== req.requester_email.toLowerCase())
    return false;
  return req.status === "clarifying";
}

/** Who may add/remove subscribers on a request: the requester or an admin. */
export function canManageSubscribers(user: User, req: RequestRef): boolean {
  if (user.isAdmin) return true;
  return user.email.toLowerCase() === req.requester_email.toLowerCase();
}

/** Who may remove a specific subscriber: the subscriber themselves
 *  (self-unsubscribe) or a manager (admin/requester). */
export function canRemoveSubscriber(
  user: User,
  req: RequestRef,
  targetEmail: string,
): boolean {
  if (user.email.toLowerCase() === targetEmail.trim().toLowerCase()) return true;
  return canManageSubscribers(user, req);
}
