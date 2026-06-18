// src/domain/authz.test.ts
import { expect, test, describe } from "bun:test";
import {
  isAdmin,
  canViewRequest,
  canReply,
  canManageSubscribers,
  canRemoveSubscriber,
} from "./authz";

const admin = { email: "boss@kokilmetal.com.tr", name: "Boss", isAdmin: true };
const owner = { email: "a@kokilmetal.com.tr", name: "A", isAdmin: false };
const other = { email: "b@kokilmetal.com.tr", name: "B", isAdmin: false };
const req = { requester_email: "a@kokilmetal.com.tr", status: "clarifying" as const };

describe("isAdmin", () => {
  test("matches allowlist case-insensitively", () => {
    expect(isAdmin("Boss@Kokilmetal.com.tr", ["boss@kokilmetal.com.tr"])).toBe(
      true,
    );
    expect(isAdmin("x@kokilmetal.com.tr", ["boss@kokilmetal.com.tr"])).toBe(
      false,
    );
  });
  test("matches allowlist entries that are not pre-lowercased", () => {
    expect(isAdmin("boss@kokilmetal.com.tr", ["Boss@Kokilmetal.com.tr"])).toBe(
      true,
    );
  });
});

describe("canViewRequest", () => {
  test("admin sees any", () => {
    expect(canViewRequest(admin, req)).toBe(true);
  });
  test("owner sees own", () => {
    expect(canViewRequest(owner, req)).toBe(true);
  });
  test("other requester cannot see", () => {
    expect(canViewRequest(other, req)).toBe(false);
  });
});

describe("canReply", () => {
  test("owner (non-admin) can reply when clarifying", () => {
    expect(canReply(owner, { ...req, status: "clarifying" })).toBe(true);
  });
  test("owner who is ALSO admin can reply to their own clarifying request", () => {
    const adminOwner = { email: "a@kokilmetal.com.tr", name: "A", isAdmin: true };
    expect(canReply(adminOwner, { ...req, status: "clarifying" })).toBe(true);
  });
  test("admin canNOT reply to someone else's request", () => {
    expect(canReply(admin, { ...req, status: "clarifying" })).toBe(false);
  });
  test("non-owner non-admin canNOT reply", () => {
    expect(canReply(other, { ...req, status: "clarifying" })).toBe(false);
  });
  test("owner canNOT reply when not clarifying (answered)", () => {
    expect(canReply(owner, { ...req, status: "answered" })).toBe(false);
  });
  test("owner cannot reply when not clarifying (new or accepted)", () => {
    expect(canReply(owner, { ...req, status: "new" })).toBe(false);
    expect(canReply(owner, { ...req, status: "accepted" })).toBe(false);
  });
  test("email comparison is case-insensitive", () => {
    const upperOwner = { email: "A@Kokilmetal.com.tr", name: "A", isAdmin: false };
    expect(canReply(upperOwner, { ...req, status: "clarifying" })).toBe(true);
  });
});

describe("canViewRequest subscriber flag", () => {
  test("subscriber flag grants access to a third party", () => {
    expect(canViewRequest(other, req, false)).toBe(false);
    expect(canViewRequest(other, req, true)).toBe(true);
  });
  test("default param keeps backward compatibility", () => {
    expect(canViewRequest(owner, req)).toBe(true);
    expect(canViewRequest(admin, req)).toBe(true);
  });
});

describe("canManageSubscribers", () => {
  test("admin or requester only", () => {
    expect(canManageSubscribers(admin, req)).toBe(true);
    expect(canManageSubscribers(owner, req)).toBe(true);
    expect(canManageSubscribers(other, req)).toBe(false);
  });
});

describe("canRemoveSubscriber", () => {
  test("self OR manager can remove", () => {
    expect(canRemoveSubscriber(other, req, "b@kokilmetal.com.tr")).toBe(true); // self
    expect(canRemoveSubscriber(admin, req, "b@kokilmetal.com.tr")).toBe(true);
    expect(canRemoveSubscriber(owner, req, "b@kokilmetal.com.tr")).toBe(true);
  });
  test("third party cannot remove someone else", () => {
    expect(canRemoveSubscriber(other, req, "c@kokilmetal.com.tr")).toBe(false);
  });
  test("self match is case-insensitive", () => {
    expect(canRemoveSubscriber(other, req, "B@KOKILMETAL.COM.TR")).toBe(true);
  });
});
