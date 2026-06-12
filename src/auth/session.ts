// src/auth/session.ts
import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionUser = { email: string; name: string };

type SignedPayload = SessionUser & { iat: number };

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/**
 * Signs a session token. `issuedAtSeconds` defaults to the current time;
 * pass an explicit value in tests for determinism.
 */
export function signSession(
  user: SessionUser,
  secret: string,
  issuedAtSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const obj: SignedPayload = {
    email: user.email,
    name: user.name,
    iat: issuedAtSeconds,
  };
  const payload = Buffer.from(JSON.stringify(obj)).toString("base64url");
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

/**
 * Verifies a session token. When `opts` is provided, the token is rejected
 * if it is older than `maxAgeSeconds` relative to `nowSeconds`. When `opts`
 * is omitted, no age check is applied (signature/shape validation only).
 */
export function verifySession(
  token: string,
  secret: string,
  opts?: { nowSeconds: number; maxAgeSeconds: number },
): SessionUser | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts as [string, string];
  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      typeof user?.email !== "string" ||
      typeof user?.name !== "string" ||
      typeof user?.iat !== "number"
    ) {
      return null;
    }
    if (opts) {
      const age = opts.nowSeconds - user.iat;
      if (age > opts.maxAgeSeconds || age < -60) return null; // expired or implausibly future
    }
    return { email: user.email, name: user.name };
  } catch {
    return null;
  }
}
