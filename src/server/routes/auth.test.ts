// src/server/routes/auth.test.ts
import { expect, test, describe } from "bun:test";
import { loadConfig } from "../../config";
import { makeHandler, type Deps } from "../handler";
import { Database } from "bun:sqlite";
import { makeRepo } from "../../db/repo";

const cfg = loadConfig({
  APP_BASE_URL: "http://localhost:3000",
  SESSION_SECRET: "test-secret-16chars-min",
  GOOGLE_CLIENT_ID: "cid",
  GOOGLE_CLIENT_SECRET: "sec",
  GOOGLE_HOSTED_DOMAIN: "kokilmetal.com.tr",
  ADMIN_EMAILS: "boss@kokilmetal.com.tr",
  SMTP_HOST: "smtp.zoho.com",
  SMTP_PORT: "465",
  SMTP_SECURE: "true",
  MAIL_FROM: "From <f@k.com>",
});

function schema(db: Database): Database {
  db.exec(`
    CREATE TABLE requests (id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_no TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
      requester_name TEXT NOT NULL, requester_email TEXT NOT NULL,
      department TEXT NOT NULL, application TEXT NOT NULL,
      module_area TEXT NOT NULL DEFAULT '', request_type TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL,
      expected_benefit TEXT NOT NULL, priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new');
    CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id),
      author_role TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE attachments (id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id),
      message_id INTEGER REFERENCES messages(id),
      storage_key TEXT NOT NULL, original_name TEXT NOT NULL,
      mime TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL);`);
  return db;
}

function makeDeps(): Deps {
  const repo = makeRepo(schema(new Database(":memory:")));
  return {
    config: cfg,
    repo,
    mailer: { async send() {} },
    storage: {
      async put() {},
      async read() { return null; },
      async remove() {},
    },
    now: () => "2026-06-12T00:00:00Z",
  };
}

describe("GET /auth/google", () => {
  test("redirects to Google OAuth URL containing state", async () => {
    const handler = makeHandler(makeDeps());
    const res = await handler(new Request("http://localhost:3000/auth/google"));
    expect(res.status).toBe(302);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("accounts.google.com");
    expect(loc).toContain("state=");
    expect(loc).toContain("hd=kokilmetal.com.tr");
  });

  test("sets oauth_state cookie (httpOnly)", async () => {
    const handler = makeHandler(makeDeps());
    const res = await handler(new Request("http://localhost:3000/auth/google"));
    // Bun's getSetCookie() returns an array of all Set-Cookie values
    const cookies = res.headers.getSetCookie();
    const stateCookie = cookies.find((c) => c.startsWith("oauth_state="));
    expect(stateCookie).toBeDefined();
    expect(stateCookie).toContain("HttpOnly");
    expect(stateCookie).toContain("SameSite=Lax");
  });

  test("state in cookie matches state in redirect URL", async () => {
    const handler = makeHandler(makeDeps());
    const res = await handler(new Request("http://localhost:3000/auth/google"));
    const cookies = res.headers.getSetCookie();
    const stateCookie = cookies.find((c) => c.startsWith("oauth_state="))!;
    // Extract state value from cookie: oauth_state=<uuid>; ...
    const cookieVal = decodeURIComponent(stateCookie.split(";")[0]!.split("=")[1]!);
    const loc = res.headers.get("location") ?? "";
    const url = new URL(loc);
    expect(url.searchParams.get("state")).toBe(cookieVal);
  });
});

describe("GET /auth/google/callback — state validation", () => {
  test("missing code → 400", async () => {
    const handler = makeHandler(makeDeps());
    const res = await handler(
      new Request("http://localhost:3000/auth/google/callback?state=abc"),
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Geçersiz oturum açma isteği");
  });

  test("missing state → 400", async () => {
    const handler = makeHandler(makeDeps());
    const res = await handler(
      new Request("http://localhost:3000/auth/google/callback?code=xyz"),
    );
    expect(res.status).toBe(400);
  });

  test("state mismatch (cookie vs query param) → 400", async () => {
    const handler = makeHandler(makeDeps());
    const res = await handler(
      new Request("http://localhost:3000/auth/google/callback?code=xyz&state=wrong", {
        headers: { cookie: "oauth_state=correct" },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Geçersiz oturum açma isteği");
  });

  test("missing oauth_state cookie → 400", async () => {
    const handler = makeHandler(makeDeps());
    const res = await handler(
      new Request("http://localhost:3000/auth/google/callback?code=xyz&state=somestate"),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /logout", () => {
  test("redirects to /auth/google", async () => {
    const handler = makeHandler(makeDeps());
    const res = await handler(
      new Request("http://localhost:3000/logout", { method: "POST" }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/google");
  });

  test("expires session and csrf cookies (Max-Age=0)", async () => {
    const handler = makeHandler(makeDeps());
    const res = await handler(
      new Request("http://localhost:3000/logout", { method: "POST" }),
    );
    const setCookies = res.headers.getSetCookie();
    const sessionExpire = setCookies.find((c) => c.startsWith("session="));
    const csrfExpire = setCookies.find((c) => c.startsWith("csrf="));
    expect(sessionExpire).toBeDefined();
    expect(sessionExpire).toContain("Max-Age=0");
    expect(csrfExpire).toBeDefined();
    expect(csrfExpire).toContain("Max-Age=0");
  });

  test("emits both expire cookies as separate Set-Cookie headers", async () => {
    const handler = makeHandler(makeDeps());
    const res = await handler(
      new Request("http://localhost:3000/logout", { method: "POST" }),
    );
    const setCookies = res.headers.getSetCookie();
    // Must have at least two Set-Cookie headers (one per cookie being expired)
    expect(setCookies.length).toBeGreaterThanOrEqual(2);
  });
});

describe("unknown /auth/* path", () => {
  test("returns 404", async () => {
    const handler = makeHandler(makeDeps());
    const res = await handler(new Request("http://localhost:3000/auth/unknown"));
    expect(res.status).toBe(404);
  });
});
