// src/server/routes/auth.ts — OAuth + logout handlers for Bun.serve pipeline
import { buildAuthUrl, exchangeCode, verifyDomain } from "../../auth/google";
import { signSession } from "../../auth/session";
import { serializeCookie, expireCookie } from "../cookies";
import { SESSION_MAX_AGE } from "../guards";
import type { ReqCtx } from "../context";
import type { Deps } from "../handler";
import { text } from "../handler";

/**
 * Handles all /auth/* and /logout routes.
 * Returns a Response for every matched path.
 */
export async function handleAuth(ctx: ReqCtx, deps: Deps): Promise<Response> {
  const { path, method, url } = ctx;
  const { config } = deps;
  const secure = config.appBaseUrl.startsWith("https");

  // GET /auth/google — kick off OAuth flow
  if (path === "/auth/google" && method === "GET") {
    const state = crypto.randomUUID();
    const stateCookie = serializeCookie("oauth_state", state, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      secure,
    });
    const redirectUrl = buildAuthUrl({
      clientId: config.googleClientId,
      redirectUri: `${config.appBaseUrl}/auth/google/callback`,
      hostedDomain: config.googleHostedDomain,
      state,
    });
    return new Response(null, {
      status: 302,
      headers: {
        location: redirectUrl,
        "set-cookie": stateCookie,
      },
    });
  }

  // GET /auth/google/callback — exchange code for session
  if (path === "/auth/google/callback" && method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const storedState = ctx.cookies["oauth_state"];

    if (!code || !state || state !== storedState) {
      return text("Geçersiz oturum açma isteği", 400);
    }

    // Network call — not unit-tested (see comment in src/routes/auth.ts)
    const profile = await exchangeCode({
      code,
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      redirectUri: `${config.appBaseUrl}/auth/google/callback`,
    });

    if (!verifyDomain(profile, config.googleHostedDomain)) {
      return text("Bu portal yalnızca kurumsal hesaplara açıktır.", 403);
    }

    const token = signSession(
      { email: profile.email.toLowerCase(), name: profile.name ?? profile.email },
      config.sessionSecret,
    );

    const sessionCookie = serializeCookie("session", token, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
      secure,
    });
    const csrfCookie = serializeCookie("csrf", crypto.randomUUID(), {
      // NON-httpOnly: must be readable by JS so SPA can echo it as X-CSRF-Token header
      httpOnly: false,
      sameSite: "Lax",
      path: "/",
      secure,
    });
    const clearStateCookie = expireCookie("oauth_state");

    // Multiple Set-Cookie headers require Headers.append(), not a plain object
    const headers = new Headers({ location: "/my" });
    headers.append("set-cookie", sessionCookie);
    headers.append("set-cookie", csrfCookie);
    headers.append("set-cookie", clearStateCookie);

    return new Response(null, { status: 302, headers });
  }

  // POST /logout — clear session and csrf, redirect to login
  if (path === "/logout" && method === "POST") {
    const headers = new Headers({ location: "/auth/google" });
    headers.append("set-cookie", expireCookie("session"));
    headers.append("set-cookie", expireCookie("csrf"));
    return new Response(null, { status: 302, headers });
  }

  // Any other /auth/* path
  return text("Not found", 404);
}
