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
    expect(canTransition("clarifying", "rejected")).toBe(true);
  });
  test("terminal statuses cannot transition out", () => {
    expect(isTerminal("rejected")).toBe(true);
    expect(canTransition("accepted", "clarifying")).toBe(false);
    expect(canTransition("rejected", "accepted")).toBe(false);
  });
  test("illegal: new -> answered (requester cannot reply before question)", () => {
    expect(canTransition("new", "answered")).toBe(false);
  });
  test("TR labels for all statuses", () => {
    expect(statusLabelTr("new")).toBe("Yeni");
    expect(statusLabelTr("clarifying")).toBe("Netleştiriliyor");
    expect(statusLabelTr("answered")).toBe("Cevaplandı");
    expect(statusLabelTr("accepted")).toBe("Kabul edildi");
    expect(statusLabelTr("rejected")).toBe("Reddedildi");
  });
  test("accepted is no longer terminal; advances to in_progress/done/cancelled", () => {
    expect(isTerminal("accepted")).toBe(false);
    expect(canTransition("accepted", "in_progress")).toBe(true);
    expect(canTransition("accepted", "done")).toBe(true);
    expect(canTransition("accepted", "cancelled")).toBe(true);
  });
  test("in_progress advances to done/cancelled only", () => {
    expect(canTransition("in_progress", "done")).toBe(true);
    expect(canTransition("in_progress", "cancelled")).toBe(true);
    expect(canTransition("in_progress", "accepted")).toBe(false);
    expect(canTransition("in_progress", "rejected")).toBe(false);
  });
  test("done and cancelled are terminal", () => {
    expect(isTerminal("done")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(canTransition("done", "in_progress")).toBe(false);
    expect(canTransition("cancelled", "accepted")).toBe(false);
  });
  test("cannot reject/cancel from pre-decision into in_progress/done", () => {
    expect(canTransition("new", "in_progress")).toBe(false);
    expect(canTransition("new", "done")).toBe(false);
    expect(canTransition("new", "cancelled")).toBe(false);
  });
  test("TR labels for new statuses", () => {
    expect(statusLabelTr("in_progress")).toBe("Yapılıyor");
    expect(statusLabelTr("done")).toBe("Tamamlandı");
    expect(statusLabelTr("cancelled")).toBe("İptal edildi");
  });
});
