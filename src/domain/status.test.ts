// src/domain/status.test.ts
import { expect, test, describe } from "bun:test";
import {
  type RequestStatus,
  isTerminal,
  canTransition,
  statusLabelTr,
} from "./status";

describe("status state machine", () => {
  test("admin question moves new -> clarifying", () => {
    expect(canTransition("new", "clarifying")).toBe(true);
  });
  test("requester reply moves clarifying -> answered", () => {
    expect(canTransition("clarifying", "answered")).toBe(true);
  });
  test("admin re-question moves answered -> clarifying", () => {
    expect(canTransition("answered", "clarifying")).toBe(true);
  });
  test("accept allowed from any non-terminal", () => {
    expect(canTransition("new", "accepted")).toBe(true);
    expect(canTransition("clarifying", "accepted")).toBe(true);
    expect(canTransition("answered", "accepted")).toBe(true);
  });
  test("reject allowed from any non-terminal", () => {
    expect(canTransition("new", "rejected")).toBe(true);
    expect(canTransition("answered", "rejected")).toBe(true);
  });
  test("terminal statuses cannot transition out", () => {
    expect(isTerminal("accepted")).toBe(true);
    expect(isTerminal("rejected")).toBe(true);
    expect(canTransition("accepted", "clarifying")).toBe(false);
    expect(canTransition("rejected", "accepted")).toBe(false);
  });
  test("illegal: new -> answered (requester cannot reply before question)", () => {
    expect(canTransition("new", "answered")).toBe(false);
  });
  test("TR labels", () => {
    expect(statusLabelTr("new")).toBe("Yeni");
    expect(statusLabelTr("rejected")).toBe("Reddedildi");
  });
});
