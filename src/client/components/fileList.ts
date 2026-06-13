// src/client/components/fileList.ts
// Pure helpers for the FileDropField — no React, no I/O.

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function removeFileAt(files: File[], index: number): File[] {
  return files.filter((_, i) => i !== index);
}
