import { expect, test } from "bun:test";
import { adminActionsFor } from "./AdminControls";

test("pre-decision statuses expose clarify/accept/reject", () => {
  for (const s of ["new", "clarifying", "answered"] as const) {
    expect(adminActionsFor(s)).toEqual(["clarify", "accept", "reject"]);
  }
});
test("accepted exposes start/complete/cancel", () => {
  expect(adminActionsFor("accepted")).toEqual(["start", "complete", "cancel"]);
});
test("in_progress exposes complete/cancel", () => {
  expect(adminActionsFor("in_progress")).toEqual(["complete", "cancel"]);
});
test("terminal statuses expose no actions", () => {
  for (const s of ["done", "rejected", "cancelled"] as const) {
    expect(adminActionsFor(s)).toEqual([]);
  }
});
