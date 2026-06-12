// src/server/guards.ts
import { timingSafeEqual } from "node:crypto";
import { verifySession } from "../auth/session";
import { isAdmin, type User } from "../domain/authz";
import type { ReqCtx } from "./context";

export const SESSION_MAX_AGE = 8 * 60 * 60; // 8 hours, in seconds
export const MAX_UPLOAD_BYTES = 110 * 1024 * 1024;

export function getSessionUser(
  ctx: ReqCtx,
  secret: string,
  adminEmails: string[],
  nowSeconds: number,
): User | null {
  const token = ctx.cookies["session"];
  if (!token) return null;
  const session = verifySession(token, secret, { nowSeconds, maxAgeSeconds: SESSION_MAX_AGE });
  if (!session) return null;
  return { email: session.email, name: session.name, isAdmin: isAdmin(session.email, adminEmails) };
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function checkCsrf(ctx: ReqCtx): boolean {
  const cookie = ctx.cookies["csrf"];
  const header = ctx.header("x-csrf-token");
  if (!cookie || !header) return false;
  return safeEqual(cookie, header);
}
