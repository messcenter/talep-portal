import { expect, test } from "bun:test";
import { parseCookies, serializeCookie, expireCookie } from "./cookies";

test("parseCookies parses a cookie header", () => {
  expect(parseCookies("a=1; b=2")).toEqual({ a: "1", b: "2" });
  expect(parseCookies(null)).toEqual({});
  expect(parseCookies("x=%20space")).toEqual({ x: " space" });
});

test("serializeCookie builds attributes", () => {
  const s = serializeCookie("session", "tok", { httpOnly: true, maxAge: 60, sameSite: "Lax" });
  expect(s).toContain("session=tok");
  expect(s).toContain("HttpOnly");
  expect(s).toContain("Max-Age=60");
  expect(s).toContain("SameSite=Lax");
  expect(s).toContain("Path=/");
});

test("serializeCookie omits HttpOnly when not set (for csrf cookie)", () => {
  const s = serializeCookie("csrf", "abc", { sameSite: "Lax" });
  expect(s).not.toContain("HttpOnly");
  expect(s).toContain("csrf=abc");
});

test("expireCookie sets Max-Age=0", () => {
  expect(expireCookie("session")).toContain("Max-Age=0");
});
