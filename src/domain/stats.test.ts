// src/domain/stats.test.ts
import { expect, test, describe } from "bun:test";
import { ageInDays, AGED_THRESHOLD_DAYS } from "./stats";

describe("ageInDays", () => {
  test("counts whole elapsed days, floored", () => {
    expect(ageInDays("2026-06-01T00:00:00.000Z", "2026-06-08T00:00:00.000Z")).toBe(7);
    expect(ageInDays("2026-06-01T00:00:00.000Z", "2026-06-08T23:59:59.000Z")).toBe(7);
    expect(ageInDays("2026-06-01T00:00:00.000Z", "2026-06-01T05:00:00.000Z")).toBe(0);
  });

  test("threshold constant is 7", () => {
    expect(AGED_THRESHOLD_DAYS).toBe(7);
  });
});
