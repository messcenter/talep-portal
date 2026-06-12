// src/server/cookies.ts

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export type CookieOpts = {
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: "Lax" | "Strict" | "None";
  secure?: boolean;
};

export function serializeCookie(name: string, value: string, o: CookieOpts = {}): string {
  let s = `${name}=${encodeURIComponent(value)}`;
  s += `; Path=${o.path ?? "/"}`;
  if (o.maxAge != null) s += `; Max-Age=${o.maxAge}`;
  if (o.sameSite) s += `; SameSite=${o.sameSite}`;
  if (o.httpOnly) s += `; HttpOnly`;
  if (o.secure) s += `; Secure`;
  return s;
}

export function expireCookie(name: string, path = "/"): string {
  return `${name}=; Path=${path}; Max-Age=0`;
}
