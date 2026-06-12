// src/server/handler.ts
import type { Config } from "../config";
import type { Repo } from "../db/repo";
import type { Mailer } from "../mail/mailer";
import type { Storage } from "../storage/storage";
import { makeCtx } from "./context";
import { getSessionUser, checkCsrf, MAX_UPLOAD_BYTES } from "./guards";
import { serializeCookie } from "./cookies";

export type Deps = {
  config: Config;
  repo: Repo;
  mailer: Mailer;
  storage: Storage;
  now: () => string;
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export function makeHandler(deps: Deps) {
  // Session age checks must use real wall-clock time, not the injectable deps.now()
  // (deps.now is for business timestamps like created_at, not for HMAC expiry).
  const nowSeconds = () => Math.floor(Date.now() / 1000);

  return async function handler(req: Request): Promise<Response> {
    const ctx = makeCtx(req);
    const { path, method } = ctx;

    // Only /api/* is auth-gated here; auth redirect routes & attachments handled in later tasks.
    if (path.startsWith("/api/")) {
      const user = getSessionUser(ctx, deps.config.sessionSecret, deps.config.adminEmails, nowSeconds());
      if (!user) return json({ error: "unauthorized" }, 401);

      // Mint a csrf cookie if missing so the SPA can read it and echo it as a header.
      const extraHeaders: Record<string, string> = {};
      let csrf = ctx.cookies["csrf"];
      if (!csrf) {
        csrf = crypto.randomUUID();
        extraHeaders["set-cookie"] = serializeCookie("csrf", csrf, { sameSite: "Lax", path: "/" });
      }

      // CSRF enforcement on mutating /api requests.
      if (method === "POST") {
        const len = Number(req.headers.get("content-length") ?? "0");
        if (Number.isFinite(len) && len > MAX_UPLOAD_BYTES) return json({ error: "too large" }, 413);
        if (!checkCsrf(ctx)) return json({ error: "csrf" }, 403);
      }

      // --- routes ---
      if (path === "/api/me" && method === "GET") {
        return json(user, 200, extraHeaders);
      }

      return json({ error: "not found" }, 404, extraHeaders);
    }

    return text("Not found", 404);
  };
}
