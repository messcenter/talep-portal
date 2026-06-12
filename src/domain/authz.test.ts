// src/domain/authz.test.ts
import { expect, test, describe } from "bun:test";
import { isAdmin, canViewRequest, canReply } from "./authz";

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
  test("owner can reply when clarifying", () => {
    expect(canReply(owner, { ...req, status: "clarifying" })).toBe(true);
  });
  test("owner cannot reply when not clarifying", () => {
    expect(canReply(owner, { ...req, status: "new" })).toBe(false);
    expect(canReply(owner, { ...req, status: "accepted" })).toBe(false);
  });
  test("admin does not reply via requester path", () => {
    expect(canReply(admin, { ...req, status: "clarifying" })).toBe(false);
  });
  test("other cannot reply", () => {
    expect(canReply(other, { ...req, status: "clarifying" })).toBe(false);
  });
});
