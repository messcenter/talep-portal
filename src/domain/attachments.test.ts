import { expect, test, describe } from "bun:test";
import {
  sniffMime, extForMime, validateUploads, storageKey,
  MAX_FILE_BYTES, MAX_FILES, type UploadMeta,
} from "./attachments";

const sig = (...bytes: number[]) => new Uint8Array(bytes);
const PNG = sig(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = sig(0xff, 0xd8, 0xff, 0xe0);
const GIF = sig(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
const WEBP = sig(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
const PDF = sig(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31);

const meta = (over: Partial<UploadMeta> = {}): UploadMeta =>
  ({ name: "f.png", size: 1000, head: PNG, ...over });

describe("sniffMime", () => {
  test("detects each allowed type by magic bytes", () => {
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(JPEG)).toBe("image/jpeg");
    expect(sniffMime(GIF)).toBe("image/gif");
    expect(sniffMime(WEBP)).toBe("image/webp");
    expect(sniffMime(PDF)).toBe("application/pdf");
  });
  test("returns null for unknown / empty", () => {
    expect(sniffMime(sig(0x00, 0x01, 0x02, 0x03))).toBeNull();
    expect(sniffMime(sig())).toBeNull();
  });
});

describe("extForMime", () => {
  test("maps mime to storage extension", () => {
    expect(extForMime("image/jpeg")).toBe("jpg");
    expect(extForMime("application/pdf")).toBe("pdf");
    expect(extForMime("text/plain")).toBeNull();
  });
});

describe("validateUploads", () => {
  test("accepts valid files and returns sniffed mimes", () => {
    const r = validateUploads([meta(), meta({ name: "d.pdf", head: PDF })]);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.mimes).toEqual(["image/png", "application/pdf"]);
  });
  test("rejects more than MAX_FILES", () => {
    const r = validateUploads(Array.from({ length: MAX_FILES + 1 }, () => meta()));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain(`${MAX_FILES}`);
  });
  test("rejects oversize file", () => {
    const r = validateUploads([meta({ size: MAX_FILE_BYTES + 1 })]);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("10 MB");
  });
  test("rejects empty file", () => {
    const r = validateUploads([meta({ size: 0 })]);
    expect(r.ok).toBe(false);
  });
  test("rejects unknown / spoofed type (extension lies, bytes don't match)", () => {
    const r = validateUploads([meta({ name: "evil.png", head: sig(0x4d, 0x5a, 0x90) })]);
    expect(r.ok).toBe(false);
    expect(r.mimes).toEqual([null]);
  });
});

describe("storageKey", () => {
  test("joins uuid and ext", () => {
    expect(storageKey("abc", "png")).toBe("abc.png");
  });
});
