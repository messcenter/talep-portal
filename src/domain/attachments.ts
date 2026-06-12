// src/domain/attachments.ts — saf doğrulama, sıfır I/O.
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES = 10;

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

export function extForMime(mime: string): string | null {
  return MIME_EXT[mime] ?? null;
}

// Gerçek türü ilk byte'lardan tespit eder; client'ın gönderdiği MIME'a güvenmeyiz.
export function sniffMime(head: Uint8Array): string | null {
  const b = head;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38)
    return "image/gif";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  )
    return "image/webp";
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)
    return "application/pdf";
  return null;
}

export type UploadMeta = { name: string; size: number; head: Uint8Array };

export function validateUploads(files: UploadMeta[]): {
  ok: boolean;
  errors: string[];
  mimes: (string | null)[];
} {
  const errors: string[] = [];
  if (files.length > MAX_FILES)
    errors.push(`En fazla ${MAX_FILES} dosya yükleyebilirsiniz.`);
  const mimes: (string | null)[] = [];
  for (const f of files) {
    const mime = sniffMime(f.head);
    mimes.push(mime);
    if (f.size <= 0) {
      errors.push(`Boş dosya: ${f.name}`);
      continue;
    }
    if (f.size > MAX_FILE_BYTES) errors.push(`${f.name}: dosya 10 MB sınırını aşıyor.`);
    if (!mime) errors.push(`${f.name}: yalnızca PNG, JPEG, WebP, GIF ve PDF kabul edilir.`);
  }
  return { ok: errors.length === 0, errors, mimes };
}

export function storageKey(uuid: string, ext: string): string {
  return `${uuid}.${ext}`;
}
