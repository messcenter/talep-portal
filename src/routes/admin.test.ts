import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { makeRepo, type Repo } from "../db/repo";
import { makeMailer } from "../mail/mailer";
import { signSession } from "../auth/session";
import { buildApp } from "../app";
import { loadConfig } from "../config";
import type { Storage } from "../storage/storage";

function makeMemStorage(): { store: Map<string, Uint8Array>; storage: Storage } {
  const store = new Map<string, Uint8Array>();
  return {
    store,
    storage: {
      async put(k, b) { store.set(k, b); },
      async read(k) { return store.get(k) ?? null; },
      async remove(k) { store.delete(k); },
    },
  };
}

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
function adminCookie() {
  return `session=${signSession({ email: "boss@kokilmetal.com.tr", name: "Boss" }, cfg.sessionSecret)}; csrf=test-csrf`;
}
function userCookie() {
  return `session=${signSession({ email: "a@kokilmetal.com.tr", name: "A" }, cfg.sessionSecret)}; csrf=test-csrf`;
}

let repo: Repo;
let sent: any[];
let app: ReturnType<typeof buildApp>;
let mem: ReturnType<typeof makeMemStorage>;

const sample = {
  requester_name: "A", requester_email: "a@kokilmetal.com.tr",
  department: "d", application: "ERP", module_area: "",
  request_type: "feature", title: "t", description: "d",
  expected_benefit: "f", priority: "high",
};

beforeEach(() => {
  repo = makeRepo(schema(new Database(":memory:")));
  sent = [];
  mem = makeMemStorage();
  app = buildApp({
    config: cfg, repo,
    mailer: makeMailer({ async sendMail(m: any) { sent.push(m); return {}; } }, cfg.mailFrom),
    storage: mem.storage,
    now: () => "2026-06-12T00:00:00Z",
  });
});

describe("admin guard", () => {
  test("non-admin gets 403 on /admin", async () => {
    const res = await app.request("/admin", { headers: { Cookie: userCookie() } });
    expect(res.status).toBe(403);
  });
});

describe("admin message", () => {
  test("adds question, sets clarifying, emails requester", async () => {
    const r = repo.createRequest(sample, "t");
    const res = await app.request(`/admin/requests/${r.id}/message`, {
      method: "POST",
      headers: { Cookie: adminCookie(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ _csrf: "test-csrf", body: "Hangi parametreler?" }).toString(),
    });
    expect(res.status).toBe(302);
    expect(repo.getRequest(r.id)?.status).toBe("clarifying");
    expect(sent.some((m) => m.to === "a@kokilmetal.com.tr")).toBe(true);
  });

  test("admin question can carry an attachment", async () => {
    const r = repo.createRequest(sample, "t");
    const fd = new FormData();
    fd.append("_csrf", "test-csrf");
    fd.append("body", "şu ekrana bakın");
    fd.append("files", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "q.png", { type: "image/png" }));
    const res = await app.request(`/admin/requests/${r.id}/message`, {
      method: "POST",
      headers: { Cookie: adminCookie() },
      body: fd,
    });
    expect(res.status).toBe(302);
    expect(repo.listAttachmentsByRequest(r.id).length).toBe(1);
  });
});

describe("admin decision", () => {
  test("reject without reason -> 400", async () => {
    const r = repo.createRequest(sample, "t");
    const res = await app.request(`/admin/requests/${r.id}/decision`, {
      method: "POST",
      headers: { Cookie: adminCookie(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ _csrf: "test-csrf", decision: "reject" }).toString(),
    });
    expect(res.status).toBe(400);
  });
  test("reject with reason sets rejected + logs reason message", async () => {
    const r = repo.createRequest(sample, "t");
    const res = await app.request(`/admin/requests/${r.id}/decision`, {
      method: "POST",
      headers: { Cookie: adminCookie(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ _csrf: "test-csrf", decision: "reject", reason: "kapsam dışı" }).toString(),
    });
    expect(res.status).toBe(302);
    expect(repo.getRequest(r.id)?.status).toBe("rejected");
    expect(repo.listMessages(r.id).some((m) => m.body === "kapsam dışı")).toBe(true);
  });
  test("accept then second decision -> 409 (terminal)", async () => {
    const r = repo.createRequest(sample, "t");
    await app.request(`/admin/requests/${r.id}/decision`, {
      method: "POST",
      headers: { Cookie: adminCookie(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ _csrf: "test-csrf", decision: "accept" }).toString(),
    });
    const res = await app.request(`/admin/requests/${r.id}/decision`, {
      method: "POST",
      headers: { Cookie: adminCookie(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ _csrf: "test-csrf", decision: "reject", reason: "x" }).toString(),
    });
    expect(res.status).toBe(409);
  });
});
