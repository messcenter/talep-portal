// src/domain/request-no.ts
export function formatRequestNo(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`invalid request sequence: ${seq}`);
  }
  return `TALEP-${String(seq).padStart(4, "0")}`;
}
