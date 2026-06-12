// src/storage/storage.ts — filesystem I/O, injected via Deps.
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

export interface Storage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array | null>;
  remove(key: string): Promise<void>;
}

export function makeFsStorage(rootDir: string): Storage {
  return {
    async put(key, bytes) {
      await mkdir(rootDir, { recursive: true });
      await writeFile(join(rootDir, key), bytes);
    },
    async read(key) {
      try {
        return new Uint8Array(await readFile(join(rootDir, key)));
      } catch (e: any) {
        if (e?.code === "ENOENT") return null;
        throw e;
      }
    },
    async remove(key) {
      try {
        await unlink(join(rootDir, key));
      } catch (e: any) {
        if (e?.code !== "ENOENT") throw e;
      }
    },
  };
}
