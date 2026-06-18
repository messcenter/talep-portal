// src/server/routes/attachments.test.ts
import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { makeRepo, type Repo } from "../../db/repo";
import { signSession } from "../../auth/session";
import { loadConfig } from "../../config";
import { makeHandler, type Deps } from "../handler";
import type { Storage } from "../../storage/storage";

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
  db.exec(`
    CREATE TABLE subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id),
      email TEXT NOT NULL,
      added_by_email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(request_id, email)
    );
    CREATE INDEX idx_subscribers_request ON subscribers(request_id);`);
  return db;
}

let repo: Repo;
let memStore: Map<string, Uint8Array>;
let storage: Storage;
let handler: (req: Request) => Promise<Response>;

function authedCookie(email = "a@kokilmetal.com.tr", name = "A"): string {
  return `session=${signSession({ email, name }, cfg.sessionSecret)}`;
}

beforeEach(() => {
  memStore = new Map();
  storage = {
    async put(k, b) { memStore.set(k, b); },
    async read(k) { return memStore.get(k) ?? null; },
    async remove(k) { memStore.delete(k); },
  };
  repo = makeRepo(schema(new Database(":memory:")));
  const deps: Deps = {
    config: cfg,
    repo,
    mailer: { async send() {} },
    storage,
    now: () => "2026-06-12T00:00:00Z",
  };
  handler = makeHandler(deps);
});

function seedRequest(email = "a@kokilmetal.com.tr") {
  return repo.createRequest(
    {
      requester_name: "A",
      requester_email: email,
      department: "d",
      application: "ERP",
      module_area: "",
      request_type: "feature",
      title: "t",
      description: "d",
      expected_benefit: "f",
      priority: "high",
    },
    "2026-06-12T00:00:00Z",
  );
}

describe("GET /requests/:id/attachments/:attId", () => {
  test("allowlisted mime (image/png) → inline disposition, nosniff, CSP sandbox", async () => {
    const r = repo.createRequest(
      { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "t", description: "d",
        expected_benefit: "f", priority: "high" },
      "2026-06-12T00:00:00Z",
      [{ storage_key: "img.png", original_name: "shot.png", mime: "image/png", size_bytes: 3 }],
    );
    memStore.set("img.png", new Uint8Array([1, 2, 3]));
    const att = repo.listAttachmentsByRequest(r.id)[0]!;

    const res = await handler(
      new Request(`http://localhost:3000/requests/${r.id}/attachments/${att.id}`, {
        headers: { cookie: authedCookie() },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toContain("inline");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  test("allowlisted mime (application/pdf) → inline disposition, CSP sandbox", async () => {
    const r = repo.createRequest(
      { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "t", description: "d",
        expected_benefit: "f", priority: "high" },
      "2026-06-12T00:00:00Z",
      [{ storage_key: "doc.pdf", original_name: "sartname.pdf", mime: "application/pdf", size_bytes: 5 }],
    );
    memStore.set("doc.pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]));
    const att = repo.listAttachmentsByRequest(r.id)[0]!;

    const res = await handler(
      new Request(`http://localhost:3000/requests/${r.id}/attachments/${att.id}`, {
        headers: { cookie: authedCookie() },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("inline");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
  });

  test("non-allowlisted mime (text/html) → forced attachment disposition + octet-stream + CSP sandbox (XSS defense)", async () => {
    const r = repo.createRequest(
      { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "t", description: "d",
        expected_benefit: "f", priority: "high" },
      "2026-06-12T00:00:00Z",
      [{ storage_key: "evil.html", original_name: "evil.html", mime: "text/html", size_bytes: 5 }],
    );
    memStore.set("evil.html", new Uint8Array([60, 33, 45, 45, 62]));
    const att = repo.listAttachmentsByRequest(r.id)[0]!;

    const res = await handler(
      new Request(`http://localhost:3000/requests/${r.id}/attachments/${att.id}`, {
        headers: { cookie: authedCookie() },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("no session → 401", async () => {
    const r = seedRequest();
    const res = await handler(
      new Request(`http://localhost:3000/requests/${r.id}/attachments/999`),
    );
    expect(res.status).toBe(401);
  });

  test("IDOR: attachment from other user's request → 404", async () => {
    const r = repo.createRequest(
      { requester_name: "B", requester_email: "b@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "t", description: "d",
        expected_benefit: "f", priority: "high" },
      "2026-06-12T00:00:00Z",
      [{ storage_key: "secret.png", original_name: "secret.png", mime: "image/png", size_bytes: 3 }],
    );
    memStore.set("secret.png", new Uint8Array([1, 2, 3]));
    const att = repo.listAttachmentsByRequest(r.id)[0]!;

    // Requesting as user A (intruder), not owner B
    const res = await handler(
      new Request(`http://localhost:3000/requests/${r.id}/attachments/${att.id}`, {
        headers: { cookie: authedCookie("a@kokilmetal.com.tr", "A") },
      }),
    );
    expect(res.status).toBe(404);
  });

  test("attId/requestId mismatch → 404", async () => {
    const r1 = repo.createRequest(
      { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "t", description: "d",
        expected_benefit: "f", priority: "high" },
      "2026-06-12T00:00:00Z",
      [{ storage_key: "f1.png", original_name: "f1.png", mime: "image/png", size_bytes: 3 }],
    );
    const r2 = repo.createRequest(
      { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "t2", description: "d",
        expected_benefit: "f", priority: "high" },
      "2026-06-12T00:00:00Z",
      [{ storage_key: "f2.png", original_name: "f2.png", mime: "image/png", size_bytes: 3 }],
    );
    const att1 = repo.listAttachmentsByRequest(r1.id)[0]!;

    // Request r2's URL but pass att1's id (which belongs to r1)
    const res = await handler(
      new Request(`http://localhost:3000/requests/${r2.id}/attachments/${att1.id}`, {
        headers: { cookie: authedCookie() },
      }),
    );
    expect(res.status).toBe(404);
  });

  test("non-existent attachment id → 404", async () => {
    const r = seedRequest();
    const res = await handler(
      new Request(`http://localhost:3000/requests/${r.id}/attachments/999999`, {
        headers: { cookie: authedCookie() },
      }),
    );
    expect(res.status).toBe(404);
  });

  test("Cache-Control: private, max-age=300 on served attachment", async () => {
    const r = repo.createRequest(
      { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "t", description: "d",
        expected_benefit: "f", priority: "high" },
      "2026-06-12T00:00:00Z",
      [{ storage_key: "img2.png", original_name: "photo.png", mime: "image/png", size_bytes: 2 }],
    );
    memStore.set("img2.png", new Uint8Array([1, 2]));
    const att = repo.listAttachmentsByRequest(r.id)[0]!;

    const res = await handler(
      new Request(`http://localhost:3000/requests/${r.id}/attachments/${att.id}`, {
        headers: { cookie: authedCookie() },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
  });
});
