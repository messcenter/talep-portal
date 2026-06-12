// src/routes/auth.ts
import type { Hono } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import type { AppEnv, Deps } from "../app";
import { SESSION_MAX_AGE } from "../app";
import type { SessionUser } from "../auth/session";
import { buildAuthUrl, exchangeCode, verifyDomain } from "../auth/google";

export function registerAuthRoutes(
  app: Hono<AppEnv>,
  deps: Deps,
  sign: (u: SessionUser, secret: string) => string,
) {
  app.get("/auth/google", (c) => {
    const state = crypto.randomUUID();
    setCookie(c, "oauth_state", state, { httpOnly: true, sameSite: "Lax", path: "/" });
    const url = buildAuthUrl({
      clientId: deps.config.googleClientId,
      redirectUri: `${deps.config.appBaseUrl}/auth/google/callback`,
      hostedDomain: deps.config.googleHostedDomain,
      state,
    });
    return c.redirect(url);
  });

  app.get("/auth/google/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state || state !== getCookie(c, "oauth_state")) {
      return c.text("Geçersiz oturum açma isteği", 400);
    }
    const profile = await exchangeCode({
      code,
      clientId: deps.config.googleClientId,
      clientSecret: deps.config.googleClientSecret,
      redirectUri: `${deps.config.appBaseUrl}/auth/google/callback`,
    });
    if (!verifyDomain(profile, deps.config.googleHostedDomain)) {
      return c.text("Bu portal yalnızca kurumsal hesaplara açıktır.", 403);
    }
    const token = sign(
      { email: profile.email.toLowerCase(), name: profile.name ?? profile.email },
      deps.config.sessionSecret,
    );
    setCookie(c, "session", token, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return c.redirect("/my");
  });

  app.post("/logout", (c) => {
    deleteCookie(c, "session", { path: "/" });
    return c.redirect("/auth/google");
  });
}
