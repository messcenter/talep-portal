import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionUser = { email: string; name: string };

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signSession(user: SessionUser, secret: string): string {
  const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

export function verifySession(
  token: string,
  secret: string,
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
    if (typeof user?.email === "string" && typeof user?.name === "string") {
      return { email: user.email, name: user.name };
    }
    return null;
  } catch {
    return null;
  }
}
