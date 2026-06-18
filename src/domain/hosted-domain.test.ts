import { expect, test } from "bun:test";
import { isHostedDomain } from "./hosted-domain";

test("matches hosted domain suffix (case-insensitive)", () => {
  expect(isHostedDomain("a@kokilmetal.com.tr", "kokilmetal.com.tr")).toBe(true);
  expect(isHostedDomain("A@KOKILMETAL.COM.TR", "kokilmetal.com.tr")).toBe(true);
});
test("rejects other domains and spoofed suffixes", () => {
  expect(isHostedDomain("a@gmail.com", "kokilmetal.com.tr")).toBe(false);
  expect(isHostedDomain("a@evilkokilmetal.com.tr", "kokilmetal.com.tr")).toBe(false);
  expect(isHostedDomain("kokilmetal.com.tr@evil.com", "kokilmetal.com.tr")).toBe(false);
});
test("trims whitespace and is case-insensitive on domain too", () => {
  expect(isHostedDomain("  a@kokilmetal.com.tr  ", "kokilmetal.com.tr")).toBe(true);
  expect(isHostedDomain("a@kokilmetal.com.tr", "KOKILMETAL.com.tr")).toBe(true);
});
