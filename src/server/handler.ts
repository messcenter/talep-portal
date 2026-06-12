// src/server/handler.ts
import type { Config } from "../config";
import type { Repo } from "../db/repo";
import type { Mailer } from "../mail/mailer";
import type { Storage } from "../storage/storage";
import { makeCtx } from "./context";
import { getSessionUser, checkCsrf, MAX_UPLOAD_BYTES } from "./guards";
import { serializeCookie } from "./cookies";
import { handleRequests } from "./routes/requests";
import { handleAdmin } from "./routes/admin";
import { handleDefinitions } from "./routes/definitions";
import { handleAuth } from "./routes/auth";
import { handleAttachment } from "./routes/attachments";

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
        extraHeaders["set-cookie"] = serializeCookie("csrf", csrf, {
          sameSite: "Lax", path: "/",
          secure: deps.config.appBaseUrl.startsWith("https"),
        });
      }

      // CSRF + size enforcement on all mutating /api requests.
      const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
      if (MUTATING.has(method)) {
        // Fast-path reject on declared size. NOT authoritative — Content-Length can be
        // absent/chunked/spoofed; the real cap is Bun.serve maxRequestBodySize (A5) +
        // actual body-size check in the multipart handlers (A2).
        const len = Number(req.headers.get("content-length") ?? "0");
        if (Number.isFinite(len) && len > MAX_UPLOAD_BYTES) return json({ error: "too large" }, 413, extraHeaders);
        if (!checkCsrf(ctx)) return json({ error: "csrf" }, 403, extraHeaders);
      }

      // --- routes ---
      if (path === "/api/me" && method === "GET") {
        return json(user, 200, extraHeaders);
      }

      // Requests API: /api/my, /api/requests, /api/requests/:id, /api/requests/:id/reply
      const requestsRes = await handleRequests(path, method, req, user, extraHeaders, deps);
      if (requestsRes) return requestsRes;

      // Admin API: /api/admin/requests, /api/admin/requests/:id/message|decision
      const adminRes = await handleAdmin(path, method, req, user, extraHeaders, deps);
      if (adminRes) return adminRes;

      // Definitions API: GET /api/departments + admin CRUD for departments/modules
      const def = await handleDefinitions(path, method, req, user, extraHeaders, deps);
      if (def) return def;

      return json({ error: "not found" }, 404, extraHeaders);
    }

    // Auth / OAuth routes (CSRF-exempt — they establish the session, not mutate app state)
    if (path.startsWith("/auth/") || path === "/logout") {
      return handleAuth(ctx, deps);
    }

    // Attachment binary serving (auth-gated inside the handler)
    const att = await handleAttachment(ctx, deps);
    if (att) return att;

    return text("Not found", 404);
  };
}
