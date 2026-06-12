import { expect, test } from "bun:test";
import { signSession } from "../auth/session";
import { getSessionUser, checkCsrf, SESSION_MAX_AGE } from "./guards";
import { makeCtx } from "./context";

const secret = "test-secret-16chars-min";
const adminEmails = ["boss@kokilmetal.com.tr"];
const now = 1_000_000;

function ctxWith(cookies: Record<string, string>, headers: Record<string, string> = {}) {
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  return makeCtx(new Request("http://x/api/me", { headers: { cookie, ...headers } }));
}

test("getSessionUser returns user for a valid fresh session", () => {
  const token = signSession({ email: "a@kokilmetal.com.tr", name: "A" }, secret, now);
  const u = getSessionUser(ctxWith({ session: token }), secret, adminEmails, now);
  expect(u).toEqual({ email: "a@kokilmetal.com.tr", name: "A", isAdmin: false });
});

test("getSessionUser marks admin", () => {
  const token = signSession({ email: "boss@kokilmetal.com.tr", name: "B" }, secret, now);
  const u = getSessionUser(ctxWith({ session: token }), secret, adminEmails, now);
  expect(u?.isAdmin).toBe(true);
});

test("getSessionUser rejects expired session", () => {
  const token = signSession({ email: "a@kokilmetal.com.tr", name: "A" }, secret, now - SESSION_MAX_AGE - 10);
  expect(getSessionUser(ctxWith({ session: token }), secret, adminEmails, now)).toBeNull();
});

test("getSessionUser returns null without a session cookie", () => {
  expect(getSessionUser(ctxWith({}), secret, adminEmails, now)).toBeNull();
});

test("checkCsrf true only when header matches csrf cookie", () => {
  expect(checkCsrf(ctxWith({ csrf: "tok" }, { "x-csrf-token": "tok" }))).toBe(true);
  expect(checkCsrf(ctxWith({ csrf: "tok" }, { "x-csrf-token": "nope" }))).toBe(false);
  expect(checkCsrf(ctxWith({ csrf: "tok" }, {}))).toBe(false);
  expect(checkCsrf(ctxWith({}, { "x-csrf-token": "tok" }))).toBe(false);
});
