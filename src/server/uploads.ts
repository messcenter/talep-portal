// src/server/uploads.ts — collects multipart files, validates, writes to storage.
import { randomUUID } from "node:crypto";
import {
  validateUploads, extForMime, storageKey, type UploadMeta,
} from "../domain/attachments";
import type { Storage } from "../storage/storage";
import type { AttachmentInput } from "../db/repo";

// Hono parseBody({ all: true }) / Bun formData(): single file -> File, multiple -> File[]. Normalize.
export function collectFiles(form: Record<string, any>): File[] {
  const raw = form["files"];
  const arr = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  // Keep only real uploads; ignore non-File values and zero-byte entries.
  return arr.filter((f): f is File => f instanceof File && f.size > 0);
}

export type UploadResult =
  | { ok: true; attachments: AttachmentInput[] }
  | { ok: false; errors: string[] };

export async function processUploads(
  files: File[],
  storage: Storage,
): Promise<UploadResult> {
  if (files.length === 0) return { ok: true, attachments: [] };
  const buffers = await Promise.all(
    files.map(async (f) => new Uint8Array(await f.arrayBuffer())),
  );
  const metas: UploadMeta[] = files.map((f, i) => ({
    name: f.name, size: f.size, head: buffers[i]!.subarray(0, 16),
  }));
  const v = validateUploads(metas);
  if (!v.ok) return { ok: false, errors: v.errors };

  const attachments: AttachmentInput[] = [];
  const written: string[] = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const mime = v.mimes[i]!; // index-safe: i < files.length === mimes.length
      const ext = extForMime(mime);
      if (!ext) throw new Error(`no extension mapping for sniffed mime ${mime}`);
      const key = storageKey(randomUUID(), ext);
      await storage.put(key, buffers[i]!);
      written.push(key);
      attachments.push({
        storage_key: key, original_name: files[i]!.name,
        mime, size_bytes: files[i]!.size,
      });
    }
  } catch (err) {
    await Promise.all(written.map((k) => storage.remove(k).catch(() => {})));
    throw err;
  }
  return { ok: true, attachments };
}

// Best-effort cleanup of written files if the DB transaction later fails.
export async function discardUploads(
  storage: Storage,
  attachments: AttachmentInput[],
): Promise<void> {
  await Promise.all(attachments.map((a) => storage.remove(a.storage_key).catch(() => {})));
}
