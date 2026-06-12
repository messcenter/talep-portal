import { expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { makeRepo, type Repo } from "../db/repo";
import { signSession } from "../auth/session";
import { loadConfig } from "../config";
import { makeHandler, type Deps } from "./handler";
import type { Storage } from "../storage/storage";

const cfg = loadConfig({
  APP_BASE_URL: "http://localhost:3000",
  SESSION_SECRET: "test-secret-16chars-min",
  GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec",
  GOOGLE_HOSTED_DOMAIN: "kokilmetal.com.tr",
  ADMIN_EMAILS: "boss@kokilmetal.com.tr",
  SMTP_HOST: "smtp.zoho.com", SMTP_PORT: "465", SMTP_SECURE: "true",
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

let repo: Repo;
let handler: (req: Request) => Promise<Response>;
const memStore = new Map<string, Uint8Array>();
const storage: Storage = {
  async put(k, b) { memStore.set(k, b); },
  async read(k) { return memStore.get(k) ?? null; },
  async remove(k) { memStore.delete(k); },
};

beforeEach(() => {
  repo = makeRepo(schema(new Database(":memory:")));
  const deps: Deps = {
    config: cfg, repo,
    mailer: { async send() {} },
    storage,
    now: () => "2026-01-01T00:00:00.000Z",
  };
  handler = makeHandler(deps);
});

function authedCookie(email = "a@kokilmetal.com.tr", name = "A") {
  return `session=${signSession({ email, name }, cfg.sessionSecret)}`;
}

test("GET /api/me without session → 401", async () => {
  const res = await handler(new Request("http://x/api/me"));
  expect(res.status).toBe(401);
});

test("GET /api/me with session → 200 + user json", async () => {
  const res = await handler(new Request("http://x/api/me", { headers: { cookie: authedCookie() } }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ email: "a@kokilmetal.com.tr", name: "A", isAdmin: false });
});

test("GET /api/me mints a csrf cookie when absent", async () => {
  const res = await handler(new Request("http://x/api/me", { headers: { cookie: authedCookie() } }));
  const setCookie = res.headers.get("set-cookie") ?? "";
  expect(setCookie).toContain("csrf=");
  expect(setCookie).not.toContain("HttpOnly"); // csrf must be readable by JS
});

test("unknown /api route → 404", async () => {
  const res = await handler(new Request("http://x/api/nope", { headers: { cookie: authedCookie() } }));
  expect(res.status).toBe(404);
});

test("POST to /api without X-CSRF-Token → 403 and still delivers a csrf cookie (bootstrap)", async () => {
  const res = await handler(new Request("http://x/api/me", {
    method: "POST",
    headers: { cookie: authedCookie() },
  }));
  expect(res.status).toBe(403);
  expect(res.headers.get("set-cookie") ?? "").toContain("csrf=");
});

test("POST with matching csrf cookie+header passes csrf gate (then 404 on GET-only route)", async () => {
  const res = await handler(new Request("http://x/api/me", {
    method: "POST",
    headers: { cookie: `${authedCookie()}; csrf=tok`, "x-csrf-token": "tok" },
  }));
  expect(res.status).toBe(404); // csrf ok, but /api/me is GET-only
});
