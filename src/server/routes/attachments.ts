// src/server/routes/attachments.ts — binary attachment serving with anti-XSS headers
import { canViewRequest } from "../../domain/authz";
import { getSessionUser } from "../guards";
import { text } from "../handler";
import type { ReqCtx } from "../context";
import type { Deps } from "../handler";

const ATT_PATTERN = /^\/requests\/(\d+)\/attachments\/(\d+)$/;

// Only these content types are served inline with their real MIME.
// Everything else is forced to application/octet-stream + attachment disposition.
const SAFE_INLINE = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

/**
 * Handles GET /requests/:id/attachments/:attId.
 * Returns null if the path doesn't match so the caller can fall through to 404.
 * Requires a valid session even though it is not under /api/.
 */
export async function handleAttachment(ctx: ReqCtx, deps: Deps): Promise<Response | null> {
  const match = ATT_PATTERN.exec(ctx.path);
  if (!match) return null;

  const { config, repo, storage } = deps;
  const nowSeconds = Math.floor(Date.now() / 1000);

  // Auth gate — this route is outside /api/ but still requires a session.
  const user = getSessionUser(ctx, config.sessionSecret, config.adminEmails, nowSeconds);
  if (!user) return text("Yetkisiz", 401);

  const id = Number(match[1]);
  const attId = Number(match[2]);

  // Sanity check (regex already ensures digits, but Number() could still be Infinity)
  if (!Number.isFinite(id) || !Number.isFinite(attId)) return text("Bulunamadı", 404);

  // Attachment must exist and belong to the stated request (prevents IDOR via id/attId swap)
  const att = repo.getAttachment(attId);
  if (!att || att.request_id !== id) return text("Bulunamadı", 404);

  // Request must exist and the current user must be allowed to view it
  const r = repo.getRequest(att.request_id);
  if (!r || !canViewRequest(user, r)) return text("Bulunamadı", 404);

  const bytes = await storage.read(att.storage_key);
  if (!bytes) return text("Bulunamadı", 404);

  // Sanitize filename: strip characters that could break Content-Disposition header
  const safeName = att.original_name.replace(/[\r\n"\\]/g, "_");

  const inlineOk = SAFE_INLINE.has(att.mime);

  const headers = new Headers();
  headers.set("Content-Type", inlineOk ? att.mime : "application/octet-stream");
  headers.set("X-Content-Type-Options", "nosniff");
  // CSP sandbox neutralizes active content (e.g. JS in a PDF) even for allowlisted types
  headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
  headers.set(
    "Content-Disposition",
    `${inlineOk ? "inline" : "attachment"}; filename="${safeName}"`,
  );
  headers.set("Cache-Control", "private, max-age=300");

  return new Response(bytes, { status: 200, headers });
}
