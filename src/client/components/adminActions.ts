// src/client/components/adminActions.ts
// Pure mapping from request status to the set of admin actions available on it.
// Kept free of React/editor imports so it can be unit-tested without a DOM.
import { type RequestStatus } from "../../domain/status";

export type AdminAction = "clarify" | "accept" | "reject" | "start" | "complete" | "cancel";

export function adminActionsFor(status: RequestStatus): AdminAction[] {
  switch (status) {
    case "new":
    case "clarifying":
    case "answered":
      return ["clarify", "accept", "reject"];
    case "accepted":
      return ["start", "complete", "cancel"];
    case "in_progress":
      return ["complete", "cancel"];
    default:
      return [];
  }
}
