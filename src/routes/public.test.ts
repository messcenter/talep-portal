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
  GOOGLE_CLIENT_ID: "cid",
  GOOGLE_CLIENT_SECRET: "sec",
  GOOGLE_HOSTED_DOMAIN: "kokilmetal.com.tr",
  ADMIN_EMAILS: "boss@kokilmetal.com.tr",
  SMTP_HOST: "smtp.zoho.com",
  SMTP_PORT: "465",
  SMTP_SECURE: "true",
  MAIL_FROM: "From <f@k.com>",
});

let repo: Repo;
let sent: any[];
let app: ReturnType<typeof buildApp>;
let mem: ReturnType<typeof makeMemStorage>;

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

function cookie(email: string, name: string): string {
  const s = signSession({ email, name }, cfg.sessionSecret);
  return `session=${s}; csrf=test-csrf`;
}

beforeEach(() => {
  repo = makeRepo(schema(new Database(":memory:")));
  sent = [];
  const mailer = makeMailer(
    { async sendMail(m: any) { sent.push(m); return {}; } },
    cfg.mailFrom,
  );
  mem = makeMemStorage();
  app = buildApp({ config: cfg, repo, mailer, storage: mem.storage, now: () => "2026-06-12T00:00:00Z" });
});

test("buildApp wires storage dependency", () => {
  expect(mem.store.size).toBe(0);
});

describe("GET / (auth gate)", () => {
  test("unauthenticated GET returns login page", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Google ile giriş");
  });
  test("authenticated GET shows form", async () => {
    const res = await app.request("/", {
      headers: { Cookie: cookie("a@kokilmetal.com.tr", "A") },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Yeni Talep");
  });
  test("new-request form is multipart with a file input", async () => {
    const res = await app.request("/", { headers: { Cookie: cookie("a@kokilmetal.com.tr", "A") } });
    const html = await res.text();
    expect(html).toContain('enctype="multipart/form-data"');
    expect(html).toContain('type="file"');
  });
  test("rendered new-request form carries the CSRF token", async () => {
    const res = await app.request("/", {
      headers: { Cookie: cookie("a@kokilmetal.com.tr", "A") },
    });
    expect(res.status).toBe(200);
    // The browser only submits a token it was given. Without this hidden
    // field, every POST /requests fails CSRF verification (403).
    expect(await res.text()).toContain('name="_csrf" value="test-csrf"');
  });
});

describe("POST /requests", () => {
  test("creates request, notifies admin, redirects", async () => {
    const form = new URLSearchParams({
      _csrf: "test-csrf",
      department: "Satın alma",
      application: "ERP",
      module_area: "",
      request_type: "feature",
      priority: "high",
      title: "Kalıp modülü",
      description: "detay",
      expected_benefit: "fayda",
    });
    const res = await app.request("/requests", {
      method: "POST",
      headers: {
        Cookie: cookie("a@kokilmetal.com.tr", "A"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    expect(res.status).toBe(302);
    const all = repo.listAll({});
    expect(all.length).toBe(1);
    expect(all[0]!.request_no).toBe("TALEP-0001");
    expect(sent.some((m) => m.to === "boss@kokilmetal.com.tr")).toBe(true);
  });

  test("invalid input re-renders form with errors", async () => {
    const form = new URLSearchParams({
      _csrf: "test-csrf",
      department: "",
      application: "ERP",
      request_type: "feature",
      priority: "high",
      title: "",
      description: "d",
      expected_benefit: "f",
    });
    const res = await app.request("/requests", {
      method: "POST",
      headers: {
        Cookie: cookie("a@kokilmetal.com.tr", "A"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    expect(res.status).toBe(400);
    expect(repo.listAll({}).length).toBe(0);
  });

  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  test("multipart upload stores attachment row and file bytes", async () => {
    const fd = new FormData();
    fd.append("_csrf", "test-csrf");
    fd.append("department", "Satın alma");
    fd.append("application", "ERP");
    fd.append("module_area", "");
    fd.append("request_type", "feature");
    fd.append("priority", "high");
    fd.append("title", "Kalıp modülü");
    fd.append("description", "detay");
    fd.append("expected_benefit", "fayda");
    fd.append("files", new File([PNG_BYTES], "shot.png", { type: "image/png" }));
    const res = await app.request("/requests", {
      method: "POST",
      headers: { Cookie: cookie("a@kokilmetal.com.tr", "A") },
      body: fd,
    });
    expect(res.status).toBe(302);
    const all = repo.listAll({});
    const atts = repo.listAttachmentsByRequest(all[0]!.id);
    expect(atts.length).toBe(1);
    expect(atts[0]!.mime).toBe("image/png");
    expect(mem.store.get(atts[0]!.storage_key)).toEqual(PNG_BYTES);
  });

  test("rejects a spoofed file type with 400 and stores nothing", async () => {
    const fd = new FormData();
    fd.append("_csrf", "test-csrf");
    fd.append("department", "d");
    fd.append("application", "ERP");
    fd.append("request_type", "feature");
    fd.append("priority", "high");
    fd.append("title", "t");
    fd.append("description", "d");
    fd.append("expected_benefit", "f");
    fd.append("files", new File([new Uint8Array([0x4d, 0x5a, 0x90])], "x.png", { type: "image/png" }));
    const res = await app.request("/requests", {
      method: "POST",
      headers: { Cookie: cookie("a@kokilmetal.com.tr", "A") },
      body: fd,
    });
    expect(res.status).toBe(400);
    expect(repo.listAll({}).length).toBe(0);
    expect(mem.store.size).toBe(0);
  });
});

describe("reply flow", () => {
  test("owner can reply only when clarifying", async () => {
    const r = repo.createRequest(
      {
        requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "t", description: "d",
        expected_benefit: "f", priority: "high",
      },
      "t",
    );
    let res = await app.request(`/requests/${r.id}/reply`, {
      method: "POST",
      headers: {
        Cookie: cookie("a@kokilmetal.com.tr", "A"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ _csrf: "test-csrf", body: "cevap" }).toString(),
    });
    expect(res.status).toBe(403);

    repo.updateStatus(r.id, "clarifying");
    res = await app.request(`/requests/${r.id}/reply`, {
      method: "POST",
      headers: {
        Cookie: cookie("a@kokilmetal.com.tr", "A"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ _csrf: "test-csrf", body: "cevap" }).toString(),
    });
    expect(res.status).toBe(302);
    expect(repo.getRequest(r.id)?.status).toBe("answered");
  });

  test("reply can carry an attachment", async () => {
    const r = repo.createRequest(
      { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "t", description: "d",
        expected_benefit: "f", priority: "high" },
      "t",
    );
    repo.updateStatus(r.id, "clarifying");
    const fd = new FormData();
    fd.append("_csrf", "test-csrf");
    fd.append("body", "cevabım ekte");
    fd.append("files", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "ek.pdf", { type: "application/pdf" }));
    const res = await app.request(`/requests/${r.id}/reply`, {
      method: "POST",
      headers: { Cookie: cookie("a@kokilmetal.com.tr", "A") },
      body: fd,
    });
    expect(res.status).toBe(302);
    const atts = repo.listAttachmentsByRequest(r.id);
    expect(atts.length).toBe(1);
    expect(atts[0]!.message_id).not.toBeNull();
    expect(atts[0]!.mime).toBe("application/pdf");
  });
});

describe("serve attachment", () => {
  async function seedWithAttachment() {
    const r = repo.createRequest(
      { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "t", description: "d",
        expected_benefit: "f", priority: "high" },
      "t",
      [{ storage_key: "img1.png", original_name: "shot.png", mime: "image/png", size_bytes: 3 }],
    );
    mem.store.set("img1.png", new Uint8Array([1, 2, 3]));
    return { r, att: repo.listAttachmentsByRequest(r.id)[0]! };
  }

  test("owner can fetch their attachment with correct headers", async () => {
    const { r, att } = await seedWithAttachment();
    const res = await app.request(`/requests/${r.id}/attachments/${att.id}`, {
      headers: { Cookie: cookie("a@kokilmetal.com.tr", "A") },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  test("stranger gets 404 (no leakage)", async () => {
    const { r, att } = await seedWithAttachment();
    const res = await app.request(`/requests/${r.id}/attachments/${att.id}`, {
      headers: { Cookie: cookie("intruder@kokilmetal.com.tr", "X") },
    });
    expect(res.status).toBe(404);
  });

  test("missing attachment id gives 404", async () => {
    const res = await app.request(`/requests/1/attachments/999999`, {
      headers: { Cookie: cookie("a@kokilmetal.com.tr", "A") },
    });
    expect(res.status).toBe(404);
  });
});
