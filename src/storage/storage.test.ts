import { expect, test, describe, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeFsStorage } from "./storage";

let dirs: string[] = [];
async function tempDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "talep-store-"));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});

describe("makeFsStorage", () => {
  test("put then read returns the same bytes", async () => {
    const s = makeFsStorage(await tempDir());
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await s.put("a.png", bytes);
    expect(await s.read("a.png")).toEqual(bytes);
  });
  test("read of missing key returns null", async () => {
    const s = makeFsStorage(await tempDir());
    expect(await s.read("nope.png")).toBeNull();
  });
  test("remove deletes the file; removing missing is a no-op", async () => {
    const s = makeFsStorage(await tempDir());
    await s.put("b.pdf", new Uint8Array([9]));
    await s.remove("b.pdf");
    expect(await s.read("b.pdf")).toBeNull();
    await s.remove("b.pdf"); // does not throw
  });
  test("creates root dir if missing", async () => {
    const root = join(await tempDir(), "nested", "uploads");
    const s = makeFsStorage(root);
    await s.put("c.gif", new Uint8Array([7]));
    expect(await s.read("c.gif")).toEqual(new Uint8Array([7]));
  });
});
