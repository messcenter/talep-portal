// src/app.ts
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Config } from "./config";
import type { Repo } from "./db/repo";
import type { Mailer } from "./mail/mailer";
import { verifySession, signSession } from "./auth/session";
import { isAdmin } from "./domain/authz";
import type { User } from "./domain/authz";
import { registerAuthRoutes } from "./routes/auth";
import { registerPublicRoutes } from "./routes/public";
import { registerAdminRoutes } from "./routes/admin";

export const SESSION_MAX_AGE = 8 * 60 * 60; // 8 hours, in seconds

export type Deps = {
  config: Config;
  repo: Repo;
  mailer: Mailer;
  now: () => string; // ISO timestamp; injectable for tests
};

export type AppEnv = {
  Variables: { user: User; csrf: string };
};

export function buildApp(deps: Deps) {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    const path = c.req.path;
    // Trailing slash is load-bearing: "/authx/..." will NOT bypass auth.
    if (path.startsWith("/auth/")) return next();

    const token = getCookie(c, "session");
    const session = token
      ? verifySession(token, deps.config.sessionSecret, {
          nowSeconds: Math.floor(Date.now() / 1000),
          maxAgeSeconds: SESSION_MAX_AGE,
        })
      : null;
    if (!session) {
      if (c.req.method !== "GET") return c.text("Oturum yok", 401);
      const { loginPage } = await import("./views/views");
      return c.html(loginPage(), 401);
    }

    const user: User = {
      email: session.email,
      name: session.name,
      isAdmin: isAdmin(session.email, deps.config.adminEmails),
    };
    c.set("user", user);

    let csrf = getCookie(c, "csrf");
    if (!csrf) {
      csrf = crypto.randomUUID();
      setCookie(c, "csrf", csrf, { httpOnly: true, sameSite: "Lax", path: "/" });
    }
    c.set("csrf", csrf);

    // CSRF verification on mutating requests. /logout is exempt: it only
    // clears the session (low CSRF risk) and the layout's logout form
    // carries no token.
    if (c.req.method === "POST" && path !== "/logout") {
      const form = await c.req.parseBody();
      const sent = form["_csrf"];
      if (sent !== csrf) return c.text("CSRF doğrulaması başarısız", 403);
      (c.req as any)._parsedBody = form;
    }
    return next();
  });

  registerAuthRoutes(app, deps, signSession);
  registerPublicRoutes(app, deps);
  registerAdminRoutes(app, deps);

  app.onError((err, c) => {
    console.error("[app] unhandled error", err);
    return c.text("Sunucu hatası", 500);
  });

  return app;
}

// Handlers read the already-parsed body to avoid double-parsing.
export async function body(c: any): Promise<Record<string, any>> {
  return (c.req as any)._parsedBody ?? (await c.req.parseBody());
}
