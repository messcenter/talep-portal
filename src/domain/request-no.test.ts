// src/domain/request-no.test.ts
import { expect, test, describe } from "bun:test";
import { formatRequestNo } from "./request-no";

describe("formatRequestNo", () => {
  test("pads to 4 digits with TALEP- prefix", () => {
    expect(formatRequestNo(1)).toBe("TALEP-0001");
    expect(formatRequestNo(16)).toBe("TALEP-0016");
    expect(formatRequestNo(123)).toBe("TALEP-0123");
  });
  test("does not truncate beyond 4 digits", () => {
    expect(formatRequestNo(12345)).toBe("TALEP-12345");
  });
  test("throws on non-positive", () => {
    expect(() => formatRequestNo(0)).toThrow();
    expect(() => formatRequestNo(-1)).toThrow();
  });
});
