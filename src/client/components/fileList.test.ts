// src/client/components/fileList.test.ts
import { expect, test } from "bun:test";
import { formatFileSize, removeFileAt } from "./fileList";

test("formatFileSize: bytes under 1 KB", () => {
  expect(formatFileSize(512)).toBe("512 B");
});

test("formatFileSize: kilobytes with one decimal", () => {
  expect(formatFileSize(2048)).toBe("2.0 KB");
});

test("formatFileSize: megabytes with one decimal", () => {
  expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
});

test("formatFileSize: zero bytes", () => {
  expect(formatFileSize(0)).toBe("0 B");
});

test("formatFileSize: exactly 1024 bytes rolls to KB", () => {
  expect(formatFileSize(1024)).toBe("1.0 KB");
});

test("removeFileAt: drops only the file at the given index", () => {
  const a = new File(["a"], "a.txt");
  const b = new File(["b"], "b.txt");
  const c = new File(["c"], "c.txt");
  const out = removeFileAt([a, b, c], 1);
  expect(out.map((f) => f.name)).toEqual(["a.txt", "c.txt"]);
});

test("removeFileAt: returns a new array, does not mutate input", () => {
  const a = new File(["a"], "a.txt");
  const input = [a];
  const out = removeFileAt(input, 0);
  expect(out).toEqual([]);
  expect(input.length).toBe(1);
});
