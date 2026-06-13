// src/client/api.ts
// Typed fetch wrapper for the Talep Portalı SPA.

/**
 * Read a single cookie value from document.cookie.
 * Returns null if the cookie is not present.
 */
export function readCookie(name: string): string | null {
  const pairs = document.cookie.split(";");
  for (const pair of pairs) {
    const [k, ...rest] = pair.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

/** Redirect to the welcome/sign-in page on 401 and throw so callers stop. */
function handle401(): never {
  window.location.href = "/login";
  throw new Error("unauthorized");
}

/**
 * GET a JSON endpoint. Throws on non-ok (non-401) status.
 * Redirects + throws on 401.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (res.status === 401) return handle401();
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<T>;
}

/**
 * Send a mutating request (POST/PATCH/DELETE/PUT).
 * Automatically adds the X-CSRF-Token header from the csrf cookie.
 * Returns null on 204; parses JSON on 200/201; throws on other non-ok.
 * Redirects + throws on 401.
 */
export async function apiSend<T = unknown>(
  path: string,
  method: string,
  body?: BodyInit,
  contentType?: string,
): Promise<T | null> {
  const csrf = readCookie("csrf") ?? "";
  const headers: Record<string, string> = { "X-CSRF-Token": csrf };
  // Only set Content-Type when given (e.g. JSON). For FormData callers we omit
  // it so the browser supplies the multipart boundary.
  if (contentType) headers["Content-Type"] = contentType;
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers,
    body,
  });
  if (res.status === 401) return handle401();
  if (res.status === 204) return null;
  if (res.status === 200 || res.status === 201) return res.json() as Promise<T>;
  // Non-ok: try to extract error message from JSON body
  let msg = `HTTP ${res.status}`;
  try {
    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data.error === "string") msg = data.error;
    else if (Array.isArray(data.errors)) msg = data.errors.join("; ");
  } catch {
    // body not JSON — keep status message
  }
  throw new Error(msg);
}
