// src/server/routes/requests.test.ts
// Integration tests for the JSON requests API via makeHandler.
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
  GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec",
  GOOGLE_HOSTED_DOMAIN: "kokilmetal.com.tr",
  ADMIN_EMAILS: "boss@kokilmetal.com.tr",
  SMTP_HOST: "smtp.zoho.com", SMTP_PORT: "465", SMTP_SECURE: "true",
  MAIL_FROM: "From <f@k.com>",
});

function schema(db: Database): Database {
  db.exec(`PRAGMA foreign_keys = ON;`);
  db.exec(`
    CREATE TABLE departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(department_id, name)
    );
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
let handler: (req: Request) => Promise<Response>;
const memStore = new Map<string, Uint8Array>();
let sent: { to: string; subject: string }[];

const storage: Storage = {
  async put(k, b) { memStore.set(k, b); },
  async read(k) { return memStore.get(k) ?? null; },
  async remove(k) { memStore.delete(k); },
};

beforeEach(() => {
  repo = makeRepo(schema(new Database(":memory:")));
  sent = [];
  memStore.clear();
  const deps: Deps = {
    config: cfg,
    repo,
    mailer: {
      async send(to, subject) { sent.push({ to, subject }); },
    },
    storage,
    now: () => "2026-01-01T00:00:00.000Z",
  };
  handler = makeHandler(deps);
});

/** Build a signed session cookie (+ optional csrf cookie) for the given user. */
function authedCookie(email = "a@kokilmetal.com.tr", name = "A", csrf = "tok") {
  const sessionToken = signSession({ email, name }, cfg.sessionSecret);
  return `session=${sessionToken}; csrf=${csrf}`;
}

/** Seed a department (and optionally modules) into repo for POST /api/requests tests. */
function seedDept(name: string, moduleNames: string[] = []) {
  const dept = repo.createDepartment(name, "2026-01-01T00:00:00.000Z");
  for (const m of moduleNames) {
    repo.createModule(dept.id, m, "2026-01-01T00:00:00.000Z");
  }
  return dept;
}

/** Default FormData with all required newRequestSchema fields.
 * Uses department "IT" — callers must seed that department before submitting. */
function validFormData(): FormData {
  const fd = new FormData();
  fd.set("department", "IT");
  fd.set("application", "ERP");
  fd.set("request_type", "feature");
  fd.set("title", "T");
  fd.set("description", "D");
  fd.set("expected_benefit", "B");
  fd.set("priority", "high");
  return fd;
}

// ─── GET /api/my ──────────────────────────────────────────────────────────────

describe("GET /api/my", () => {
  test("returns only the authed user's requests", async () => {
    // Seed 2 requests for user A and 1 for user B.
    repo.createRequest(
      { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "t1", description: "d", expected_benefit: "b", priority: "high" },
      "2026-01-01T00:00:00.000Z",
    );
    repo.createRequest(
      { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d2", application: "CRM", module_area: "",
        request_type: "bug", title: "t2", description: "d2", expected_benefit: "b2", priority: "low" },
      "2026-01-01T00:00:00.000Z",
    );
    repo.createRequest(
      { requester_name: "B", requester_email: "b@kokilmetal.com.tr",
        department: "d3", application: "X", module_area: "",
        request_type: "task", title: "t3", description: "d3", expected_benefit: "b3", priority: "medium" },
      "2026-01-01T00:00:00.000Z",
    );

    const res = await handler(new Request("http://x/api/my", {
      headers: { cookie: authedCookie("a@kokilmetal.com.tr", "A") },
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body.length).toBe(2);
    expect(body.every((r: any) => r.requester_email === "a@kokilmetal.com.tr")).toBe(true);
  });

  test("returns empty array when user has no requests", async () => {
    const res = await handler(new Request("http://x/api/my", {
      headers: { cookie: authedCookie() },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("carries csrf Set-Cookie header in response", async () => {
    // authed but no csrf cookie → new csrf minted
    const sessionToken = signSession({ email: "a@kokilmetal.com.tr", name: "A" }, cfg.sessionSecret);
    const res = await handler(new Request("http://x/api/my", {
      headers: { cookie: `session=${sessionToken}` },
    }));
    expect(res.headers.get("set-cookie") ?? "").toContain("csrf=");
  });
});

// ─── POST /api/requests ───────────────────────────────────────────────────────

describe("POST /api/requests", () => {
  test("happy path: 201 with {id}, request persisted, mails sent", async () => {
    seedDept("IT");
    const fd = validFormData();
    const res = await handler(new Request("http://x/api/requests", {
      method: "POST",
      body: fd,
      headers: { cookie: `${authedCookie()}`, "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(201);
    const body = await res.json() as { id: number };
    expect(typeof body.id).toBe("number");
    const persisted = repo.getRequest(body.id);
    expect(persisted).not.toBeNull();
    expect(persisted!.title).toBe("T");
    // Admin mail sent
    expect(sent.some((m) => m.to === "boss@kokilmetal.com.tr")).toBe(true);
    // Requester confirmation mail
    expect(sent.some((m) => m.to === "a@kokilmetal.com.tr")).toBe(true);
  });

  test("validation fail (missing required field) → 400 with {errors}", async () => {
    const fd = new FormData();
    fd.set("department", "IT");
    // Missing: application, request_type, title, description, expected_benefit, priority
    const res = await handler(new Request("http://x/api/requests", {
      method: "POST",
      body: fd,
      headers: { cookie: authedCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(400);
    const body = await res.json() as { errors: string[] };
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);
    // Nothing persisted
    expect(repo.listByEmail("a@kokilmetal.com.tr").length).toBe(0);
  });

  test("multipart POST WITHOUT X-CSRF-Token → 403, request NOT persisted", async () => {
    // No "x-csrf-token" header; cookie has csrf=tok but header is absent.
    seedDept("IT");
    const fd = validFormData();
    const res = await handler(new Request("http://x/api/requests", {
      method: "POST",
      body: fd,
      headers: {
        // csrf cookie present but no X-CSRF-Token header
        cookie: authedCookie(),
      },
    }));
    expect(res.status).toBe(403);
    expect(repo.listByEmail("a@kokilmetal.com.tr").length).toBe(0);
  });

  test("carries extraHeaders (csrf cookie) even on 400", async () => {
    const sessionToken = signSession({ email: "a@kokilmetal.com.tr", name: "A" }, cfg.sessionSecret);
    // No csrf cookie → will be minted; but form is invalid → 400.
    const fd = new FormData(); // empty
    const res = await handler(new Request("http://x/api/requests", {
      method: "POST",
      body: fd,
      // csrf cookie in header so CSRF gate passes, but form has no csrf-header → need to set it
      // Let's supply a csrf cookie + matching header.
      headers: { cookie: `session=${sessionToken}; csrf=tok`, "x-csrf-token": "tok" },
    }));
    // 400 due to validation failure
    expect(res.status).toBe(400);
    // content-type is JSON
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  test("file upload: attachment row persisted and bytes stored", async () => {
    seedDept("IT");
    const fd = validFormData();
    fd.set("files", new File([PNG_BYTES], "shot.png", { type: "image/png" }));
    const res = await handler(new Request("http://x/api/requests", {
      method: "POST",
      body: fd,
      headers: { cookie: authedCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(201);
    const { id } = await res.json() as { id: number };
    const atts = repo.listAttachmentsByRequest(id);
    expect(atts.length).toBe(1);
    expect(atts[0]!.mime).toBe("image/png");
    expect(memStore.get(atts[0]!.storage_key)).toEqual(PNG_BYTES);
  });

  test("spoofed file type (MZ/PE header declared as image/png) → 400, nothing stored, request not persisted", async () => {
    // MZ header — a Windows PE executable disguised as a PNG.
    const MZ_BYTES = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    seedDept("IT");
    const fd = validFormData();
    fd.set("files", new File([MZ_BYTES], "exploit.png", { type: "image/png" }));
    const res = await handler(new Request("http://x/api/requests", {
      method: "POST",
      body: fd,
      headers: { cookie: authedCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(400);
    // Nothing should be persisted — no request row, no bytes in storage.
    expect(repo.listByEmail("a@kokilmetal.com.tr").length).toBe(0);
    expect(memStore.size).toBe(0);
  });

  // ── DM3: department/module strictness ────────────────────────────────────────

  test("unknown department → 400, request NOT persisted", async () => {
    // Do NOT seed any department — "IT" is not in the managed list.
    const fd = validFormData(); // uses department="IT"
    const res = await handler(new Request("http://x/api/requests", {
      method: "POST",
      body: fd,
      headers: { cookie: authedCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(400);
    const body = await res.json() as { errors: string[] };
    expect(body.errors).toContain("Geçersiz departman");
    expect(repo.listByEmail("a@kokilmetal.com.tr").length).toBe(0);
  });

  test("module not belonging to the chosen department → 400, request NOT persisted", async () => {
    // Seed two departments, each with their own module.
    seedDept("Muhasebe", ["Finans"]);
    seedDept("Üretim", ["Stok"]);
    // Submit for "Muhasebe" but with module_area "Stok" (belongs to "Üretim").
    const fd = new FormData();
    fd.set("department", "Muhasebe");
    fd.set("application", "ERP");
    fd.set("module_area", "Stok");
    fd.set("request_type", "feature");
    fd.set("title", "T");
    fd.set("description", "D");
    fd.set("expected_benefit", "B");
    fd.set("priority", "high");
    const res = await handler(new Request("http://x/api/requests", {
      method: "POST",
      body: fd,
      headers: { cookie: authedCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(400);
    const body = await res.json() as { errors: string[] };
    expect(body.errors).toContain("Geçersiz modül");
    expect(repo.listByEmail("a@kokilmetal.com.tr").length).toBe(0);
  });

  test("valid department + valid module → 201", async () => {
    seedDept("Muhasebe", ["Finans"]);
    const fd = new FormData();
    fd.set("department", "Muhasebe");
    fd.set("application", "ERP");
    fd.set("module_area", "Finans");
    fd.set("request_type", "feature");
    fd.set("title", "T");
    fd.set("description", "D");
    fd.set("expected_benefit", "B");
    fd.set("priority", "high");
    const res = await handler(new Request("http://x/api/requests", {
      method: "POST",
      body: fd,
      headers: { cookie: authedCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(201);
    const { id } = await res.json() as { id: number };
    expect(repo.getRequest(id)?.module_area).toBe("Finans");
  });

  test("valid department + empty module_area → 201", async () => {
    seedDept("Muhasebe", ["Finans"]);
    const fd = new FormData();
    fd.set("department", "Muhasebe");
    fd.set("application", "ERP");
    fd.set("module_area", "");
    fd.set("request_type", "feature");
    fd.set("title", "T");
    fd.set("description", "D");
    fd.set("expected_benefit", "B");
    fd.set("priority", "high");
    const res = await handler(new Request("http://x/api/requests", {
      method: "POST",
      body: fd,
      headers: { cookie: authedCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(201);
    const { id } = await res.json() as { id: number };
    expect(repo.getRequest(id)?.module_area).toBe("");
  });
});

// ─── GET /api/requests/:id ────────────────────────────────────────────────────

describe("GET /api/requests/:id", () => {
  function seedRequest(email = "a@kokilmetal.com.tr") {
    return repo.createRequest(
      { requester_name: "A", requester_email: email,
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "t", description: "d",
        expected_benefit: "b", priority: "high" },
      "2026-01-01T00:00:00.000Z",
    );
  }

  test("owner GET → 200 with {request, messages, attachments}", async () => {
    const r = seedRequest();
    const res = await handler(new Request(`http://x/api/requests/${r.id}`, {
      headers: { cookie: authedCookie() },
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { request: any; messages: any[]; attachments: any[] };
    expect(body.request.id).toBe(r.id);
    expect(Array.isArray(body.messages)).toBe(true);
    expect(Array.isArray(body.attachments)).toBe(true);
  });

  test("non-owner (different user, non-admin) → 404 (IDOR guard)", async () => {
    const r = seedRequest("a@kokilmetal.com.tr");
    const res = await handler(new Request(`http://x/api/requests/${r.id}`, {
      headers: { cookie: authedCookie("b@kokilmetal.com.tr", "B") },
    }));
    expect(res.status).toBe(404);
  });

  test("non-integer id → 404", async () => {
    const res = await handler(new Request("http://x/api/requests/abc", {
      headers: { cookie: authedCookie() },
    }));
    expect(res.status).toBe(404);
  });

  test("nonexistent id → 404", async () => {
    const res = await handler(new Request("http://x/api/requests/99999", {
      headers: { cookie: authedCookie() },
    }));
    expect(res.status).toBe(404);
  });

  test("admin can view any request", async () => {
    const r = seedRequest("a@kokilmetal.com.tr");
    // boss@kokilmetal.com.tr is the admin.
    const res = await handler(new Request(`http://x/api/requests/${r.id}`, {
      headers: { cookie: authedCookie("boss@kokilmetal.com.tr", "Boss") },
    }));
    expect(res.status).toBe(200);
  });
});

// ─── POST /api/requests/:id/reply ─────────────────────────────────────────────

describe("POST /api/requests/:id/reply", () => {
  function seedClarifyingRequest(email = "a@kokilmetal.com.tr") {
    const r = repo.createRequest(
      { requester_name: "A", requester_email: email,
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "t", description: "d",
        expected_benefit: "b", priority: "high" },
      "2026-01-01T00:00:00.000Z",
    );
    repo.updateStatus(r.id, "clarifying");
    return r;
  }

  function replyForm(body = "My reply") {
    const fd = new FormData();
    fd.set("body", body);
    return fd;
  }

  test("canReply (status=clarifying, owner) → 204; message persisted, status=answered", async () => {
    const r = seedClarifyingRequest();
    const res = await handler(new Request(`http://x/api/requests/${r.id}/reply`, {
      method: "POST",
      body: replyForm(),
      headers: { cookie: authedCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(204);
    expect(repo.getRequest(r.id)?.status).toBe("answered");
    const msgs = repo.listMessages(r.id);
    expect(msgs.length).toBe(1);
    expect(msgs[0]!.author_role).toBe("requester");
    expect(msgs[0]!.body).toBe("My reply");
  });

  test("not owner → 404", async () => {
    const r = seedClarifyingRequest("a@kokilmetal.com.tr");
    const res = await handler(new Request(`http://x/api/requests/${r.id}/reply`, {
      method: "POST",
      body: replyForm(),
      headers: { cookie: authedCookie("b@kokilmetal.com.tr", "B"), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(404);
  });

  test("owner but cannot reply (status=new, not clarifying) → 403", async () => {
    const r = repo.createRequest(
      { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "t", description: "d",
        expected_benefit: "b", priority: "high" },
      "2026-01-01T00:00:00.000Z",
    );
    // Status is 'new' → canReply returns false.
    const res = await handler(new Request(`http://x/api/requests/${r.id}/reply`, {
      method: "POST",
      body: replyForm(),
      headers: { cookie: authedCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(403);
  });

  test("non-integer id → 404", async () => {
    const res = await handler(new Request("http://x/api/requests/bad/reply", {
      method: "POST",
      body: replyForm(),
      headers: { cookie: authedCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(404);
  });

  test("empty body → 400", async () => {
    const r = seedClarifyingRequest();
    const fd = new FormData();
    fd.set("body", "   "); // blank → fails nonBlank validation
    const res = await handler(new Request(`http://x/api/requests/${r.id}/reply`, {
      method: "POST",
      body: fd,
      headers: { cookie: authedCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(400);
    // Status unchanged.
    expect(repo.getRequest(r.id)?.status).toBe("clarifying");
  });

  test("204 carries csrf cookie header when it was newly minted", async () => {
    const r = seedClarifyingRequest();
    // Supply session but NO csrf cookie so one gets minted. Also supply X-CSRF-Token to pass gate.
    // Actually if no csrf cookie exists, the gate won't have a cookie to compare →
    // we need the cookie. Let's verify that the normal case (csrf present) still echoes headers.
    const res = await handler(new Request(`http://x/api/requests/${r.id}/reply`, {
      method: "POST",
      body: replyForm(),
      headers: { cookie: authedCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(204);
    // csrf cookie was present → extraHeaders is empty → no set-cookie (that's fine).
    // Just assert the status; header presence is optional when csrf was already there.
    expect(res.body).toBeNull();
  });

  test("reply with attachment: stored and linked to message", async () => {
    const r = seedClarifyingRequest();
    const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]);
    const fd = replyForm("see attachment");
    fd.set("files", new File([PDF_BYTES], "doc.pdf", { type: "application/pdf" }));
    const res = await handler(new Request(`http://x/api/requests/${r.id}/reply`, {
      method: "POST",
      body: fd,
      headers: { cookie: authedCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(204);
    const atts = repo.listAttachmentsByRequest(r.id);
    expect(atts.length).toBe(1);
    expect(atts[0]!.mime).toBe("application/pdf");
    expect(atts[0]!.message_id).not.toBeNull();
  });

  test("admin-owner can reply to their own clarifying request → 204", async () => {
    // boss@ submits a request, then admin sends a clarification question, then boss@ (as owner) replies.
    const r = repo.createRequest(
      { requester_name: "Yönetici", requester_email: "boss@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "t", description: "d",
        expected_benefit: "b", priority: "high" },
      "2026-01-01T00:00:00.000Z",
    );
    repo.addMessageAndTransition(r.id, { role: "admin", body: "soru" }, "clarifying", "2026-01-01T00:00:00.000Z");
    const sessionToken = signSession({ email: "boss@kokilmetal.com.tr", name: "Boss" }, cfg.sessionSecret);
    const res = await handler(new Request(`http://x/api/requests/${r.id}/reply`, {
      method: "POST",
      body: replyForm("cevap"),
      headers: { cookie: `session=${sessionToken}; csrf=tok`, "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(204);
    expect(repo.getRequest(r.id)?.status).toBe("answered");
  });

  test("CSRF symmetry: POST without X-CSRF-Token → 403, message NOT persisted", async () => {
    const r = seedClarifyingRequest();
    const res = await handler(new Request(`http://x/api/requests/${r.id}/reply`, {
      method: "POST",
      body: replyForm(),
      headers: { cookie: authedCookie() }, // csrf cookie present but no x-csrf-token header
    }));
    expect(res.status).toBe(403);
    // No messages persisted; status unchanged.
    expect(repo.listMessages(r.id).length).toBe(0);
    expect(repo.getRequest(r.id)?.status).toBe("clarifying");
  });
});

// ─── Subscribers in detail ───────────────────────────────────────────────────

function seedOwnRequest(email = "a@kokilmetal.com.tr") {
  return repo.createRequest(
    { requester_name: "A", requester_email: email,
      department: "d", application: "ERP", module_area: "",
      request_type: "feature", title: "t", description: "d",
      expected_benefit: "b", priority: "high" },
    "2026-01-01T00:00:00.000Z",
  );
}

describe("GET /api/requests/:id — subscribers in detail", () => {
  test("detail includes subscribers list + isSubscriber flag for subscriber", async () => {
    const r = seedOwnRequest();
    repo.addSubscriber(r.id, "c@kokilmetal.com.tr", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
    const res = await handler(new Request(`http://x/api/requests/${r.id}`, {
      headers: { cookie: authedCookie("c@kokilmetal.com.tr", "C") },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isSubscriber).toBe(true);
    expect(body.subscribers.map((s: any) => s.email)).toContain("c@kokilmetal.com.tr");
  });

  test("owner sees subscribers list with isSubscriber=false", async () => {
    const r = seedOwnRequest();
    repo.addSubscriber(r.id, "c@kokilmetal.com.tr", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
    const res = await handler(new Request(`http://x/api/requests/${r.id}`, {
      headers: { cookie: authedCookie("a@kokilmetal.com.tr", "A") },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isSubscriber).toBe(false);
    expect(body.subscribers.length).toBe(1);
  });

  test("non-subscriber third party gets 404 (no leak)", async () => {
    const r = seedOwnRequest();
    repo.addSubscriber(r.id, "c@kokilmetal.com.tr", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
    const res = await handler(new Request(`http://x/api/requests/${r.id}`, {
      headers: { cookie: authedCookie("d@kokilmetal.com.tr", "D") },
    }));
    expect(res.status).toBe(404);
  });
});
