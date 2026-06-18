// src/server/routes/admin.test.ts
// Integration tests for the Admin JSON API via makeHandler.
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

/** Signed session cookie for admin user. */
function adminCookie(csrf = "tok") {
  const token = signSession({ email: "boss@kokilmetal.com.tr", name: "Boss" }, cfg.sessionSecret);
  return `session=${token}; csrf=${csrf}`;
}

/** Signed session cookie for a regular (non-admin) user. */
function userCookie(email = "a@kokilmetal.com.tr", name = "A", csrf = "tok") {
  const token = signSession({ email, name }, cfg.sessionSecret);
  return `session=${token}; csrf=${csrf}`;
}

/** Seed a basic request for the given requester email. */
function seedRequest(email = "a@kokilmetal.com.tr") {
  return repo.createRequest(
    {
      requester_name: "A", requester_email: email,
      department: "d", application: "ERP", module_area: "",
      request_type: "feature", title: "My Title", description: "Desc",
      expected_benefit: "Benefit", priority: "high",
    },
    "2026-01-01T00:00:00.000Z",
  );
}

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────

describe("GET /api/admin/stats", () => {
  test("non-admin → 403", async () => {
    const res = await handler(new Request("http://x/api/admin/stats", {
      headers: { cookie: userCookie() },
    }));
    expect(res.status).toBe(403);
  });

  test("admin → 200 with status/priority breakdown and aged list", async () => {
    const r1 = repo.createRequest(
      { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "Eski talep", description: "x",
        expected_benefit: "y", priority: "high" },
      "2026-01-01T00:00:00.000Z",
    );
    repo.createRequest(
      { requester_name: "B", requester_email: "b@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "bug", title: "Yeni talep", description: "x",
        expected_benefit: "y", priority: "medium" },
      "2026-01-01T00:00:00.000Z",
    );

    const res = await handler(new Request("http://x/api/admin/stats", {
      headers: { cookie: adminCookie() },
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.total).toBe(2);
    expect(body.open).toBe(2);
    expect(body.byStatus.new).toBe(2);
    expect(body.openByPriority).toEqual({ low: 0, medium: 1, high: 1 });
    expect(body.agedCount).toBe(0);
    expect(Array.isArray(body.aged)).toBe(true);
  });

  test("stale open request surfaces in aged list with correct shape", async () => {
    // Created old AND last message is 31 days before `now` → aged.
    const r = repo.createRequest(
      { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "Bekleyen talep", description: "x",
        expected_benefit: "y", priority: "high" },
      "2025-11-01T00:00:00.000Z",
    );
    repo.addMessageAndTransition(r.id, { role: "admin", body: "cevap" }, "clarifying", "2025-12-01T00:00:00.000Z");

    const res = await handler(new Request("http://x/api/admin/stats", {
      headers: { cookie: adminCookie() },
    }));
    const body = await res.json() as any;
    expect(body.agedCount).toBe(1);
    expect(body.aged).toHaveLength(1);
    expect(body.aged[0].id).toBe(r.id);
    expect(body.aged[0].request_no).toBe(r.request_no);
    expect(body.aged[0].status).toBe("clarifying");
    expect(body.aged[0].age_days).toBe(31);
  });

  test("last_activity follows latest message, not created_at", async () => {
    const r = repo.createRequest(
      { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "Hareketli", description: "x",
        expected_benefit: "y", priority: "low" },
      "2025-01-01T00:00:00.000Z",
    );
    repo.addMessageAndTransition(r.id, { role: "admin", body: "Soru?" }, "clarifying", "2026-01-01T00:00:00.000Z");

    const res = await handler(new Request("http://x/api/admin/stats", {
      headers: { cookie: adminCookie() },
    }));
    const body = await res.json() as any;
    expect(body.agedCount).toBe(0);
    expect(body.byStatus.clarifying).toBe(1);
  });
});

// ─── GET /api/admin/requests ──────────────────────────────────────────────────

describe("GET /api/admin/requests", () => {
  test("admin → 200 array of all requests", async () => {
    seedRequest("a@kokilmetal.com.tr");
    seedRequest("b@kokilmetal.com.tr");
    const res = await handler(new Request("http://x/api/admin/requests", {
      headers: { cookie: adminCookie() },
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
  });

  test("admin with ?status=new → filters by status", async () => {
    const r1 = seedRequest();
    // Advance r1 to clarifying
    repo.addMessageAndTransition(r1.id, { role: "admin", body: "Q?" }, "clarifying", "2026-01-01T00:00:00.000Z");
    seedRequest("b@kokilmetal.com.tr"); // stays new

    const res = await handler(new Request("http://x/api/admin/requests?status=new", {
      headers: { cookie: adminCookie() },
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body.every((r: any) => r.status === "new")).toBe(true);
    expect(body.length).toBe(1);
  });

  test("non-admin → 403", async () => {
    const res = await handler(new Request("http://x/api/admin/requests", {
      headers: { cookie: userCookie() },
    }));
    expect(res.status).toBe(403);
  });
});

// ─── POST /api/admin/requests/:id/message ────────────────────────────────────

describe("POST /api/admin/requests/:id/message", () => {
  function messageForm(body = "Please clarify this") {
    const fd = new FormData();
    fd.set("body", body);
    return fd;
  }

  test("non-admin → 403", async () => {
    const r = seedRequest();
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/message`, {
      method: "POST",
      body: messageForm(),
      headers: { cookie: userCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(403);
    // No state change
    expect(repo.getRequest(r.id)?.status).toBe("new");
  });

  test("happy path → 204, message persisted with role 'admin', status='clarifying'", async () => {
    const r = seedRequest();
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/message`, {
      method: "POST",
      body: messageForm("Please clarify this"),
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(204);
    expect(repo.getRequest(r.id)?.status).toBe("clarifying");
    const msgs = repo.listMessages(r.id);
    expect(msgs.length).toBe(1);
    expect(msgs[0]!.author_role).toBe("admin");
    expect(msgs[0]!.body).toBe("Please clarify this");
  });

  test("terminal request (accepted) → 409", async () => {
    const r = seedRequest();
    repo.addMessageAndTransition(r.id, null, "accepted", "2026-01-01T00:00:00.000Z");
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/message`, {
      method: "POST",
      body: messageForm(),
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(409);
    // Status unchanged
    expect(repo.getRequest(r.id)?.status).toBe("accepted");
  });

  test("terminal request (rejected) → 409", async () => {
    const r = seedRequest();
    repo.addMessageAndTransition(r.id, { role: "admin", body: "No." }, "rejected", "2026-01-01T00:00:00.000Z");
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/message`, {
      method: "POST",
      body: messageForm(),
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(409);
  });

  test("without X-CSRF-Token → 403 (centralized CSRF gate)", async () => {
    const r = seedRequest();
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/message`, {
      method: "POST",
      body: messageForm(),
      headers: { cookie: adminCookie() }, // no x-csrf-token header
    }));
    expect(res.status).toBe(403);
    // No message persisted
    expect(repo.listMessages(r.id).length).toBe(0);
  });

  test("non-existent id → 404", async () => {
    const res = await handler(new Request("http://x/api/admin/requests/99999/message", {
      method: "POST",
      body: messageForm(),
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(404);
  });

  test("non-integer id → 404", async () => {
    const res = await handler(new Request("http://x/api/admin/requests/abc/message", {
      method: "POST",
      body: messageForm(),
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(404);
  });

  test("empty body → 400", async () => {
    const r = seedRequest();
    const fd = new FormData();
    fd.set("body", "   "); // blank → fails nonBlank
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/message`, {
      method: "POST",
      body: fd,
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(400);
    expect(repo.getRequest(r.id)?.status).toBe("new");
  });

  test("mail sent to requester after message", async () => {
    const r = seedRequest("a@kokilmetal.com.tr");
    await handler(new Request(`http://x/api/admin/requests/${r.id}/message`, {
      method: "POST",
      body: messageForm("Need info"),
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(sent.some((m) => m.to === "a@kokilmetal.com.tr")).toBe(true);
  });

  test("admin CANNOT add clarification to their OWN request → 403", async () => {
    const r = seedRequest("boss@kokilmetal.com.tr");
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/message`, {
      method: "POST",
      body: messageForm("A question"),
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(403);
    // No state change
    expect(repo.getRequest(r.id)?.status).toBe("new");
  });

  test("admin CAN clarify someone else's request → 204 (regression)", async () => {
    const r = seedRequest("ali@kokilmetal.com.tr");
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/message`, {
      method: "POST",
      body: messageForm("Please clarify"),
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(204);
    expect(repo.getRequest(r.id)?.status).toBe("clarifying");
  });

  test("admin question can carry an attachment: stored and linked to message", async () => {
    const r = seedRequest();
    const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fd = new FormData();
    fd.set("body", "şu ekrana bakın");
    fd.set("files", new File([PNG_BYTES], "q.png", { type: "image/png" }));
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/message`, {
      method: "POST",
      body: fd,
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(204);
    expect(repo.getRequest(r.id)?.status).toBe("clarifying");
    const atts = repo.listAttachmentsByRequest(r.id);
    expect(atts.length).toBe(1);
    expect(atts[0]!.mime).toBe("image/png");
    expect(atts[0]!.message_id).not.toBeNull();
  });
});

// ─── POST /api/admin/requests/:id/decision ───────────────────────────────────

describe("POST /api/admin/requests/:id/decision", () => {
  function acceptForm() {
    const fd = new FormData();
    fd.set("decision", "accept");
    return fd;
  }

  function rejectForm(reason = "Not feasible") {
    const fd = new FormData();
    fd.set("decision", "reject");
    fd.set("reason", reason);
    return fd;
  }

  test("non-admin → 403", async () => {
    const r = seedRequest();
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
      method: "POST",
      body: acceptForm(),
      headers: { cookie: userCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(403);
    expect(repo.getRequest(r.id)?.status).toBe("new");
  });

  test("accept → 204, status='accepted'", async () => {
    const r = seedRequest();
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
      method: "POST",
      body: acceptForm(),
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(204);
    expect(repo.getRequest(r.id)?.status).toBe("accepted");
  });

  test("reject with reason → 204, status='rejected', reason message persisted", async () => {
    const r = seedRequest();
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
      method: "POST",
      body: rejectForm("Not feasible at this time"),
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(204);
    expect(repo.getRequest(r.id)?.status).toBe("rejected");
    const msgs = repo.listMessages(r.id);
    expect(msgs.length).toBe(1);
    expect(msgs[0]!.author_role).toBe("admin");
    expect(msgs[0]!.body).toBe("Not feasible at this time");
  });

  test("reject without reason → 400 (decisionSchema requires reason for reject)", async () => {
    const r = seedRequest();
    const fd = new FormData();
    fd.set("decision", "reject"); // no reason
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
      method: "POST",
      body: fd,
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(400);
    expect(repo.getRequest(r.id)?.status).toBe("new");
  });

  test("already closed (accepted) → 409", async () => {
    const r = seedRequest();
    repo.addMessageAndTransition(r.id, null, "accepted", "2026-01-01T00:00:00.000Z");
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
      method: "POST",
      body: acceptForm(),
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(409);
  });

  test("already closed (rejected) → 409", async () => {
    const r = seedRequest();
    repo.addMessageAndTransition(r.id, { role: "admin", body: "No." }, "rejected", "2026-01-01T00:00:00.000Z");
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
      method: "POST",
      body: acceptForm(),
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(409);
  });

  test("non-existent id → 404", async () => {
    const res = await handler(new Request("http://x/api/admin/requests/99999/decision", {
      method: "POST",
      body: acceptForm(),
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(404);
  });

  test("admin CANNOT decide their OWN request → 403", async () => {
    const r = seedRequest("boss@kokilmetal.com.tr");
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
      method: "POST",
      body: acceptForm(),
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(403);
    // No state change
    expect(repo.getRequest(r.id)?.status).toBe("new");
  });

  test("admin CAN decide someone else's request → 204 (regression)", async () => {
    const r = seedRequest("ali@kokilmetal.com.tr");
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
      method: "POST",
      body: acceptForm(),
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(204);
    expect(repo.getRequest(r.id)?.status).toBe("accepted");
  });

  test("mail sent to requester after decision", async () => {
    const r = seedRequest("a@kokilmetal.com.tr");
    await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
      method: "POST",
      body: acceptForm(),
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(sent.some((m) => m.to === "a@kokilmetal.com.tr")).toBe(true);
  });

  function decisionForm(decision: string, reason?: string) {
    const fd = new FormData();
    fd.set("decision", decision);
    if (reason !== undefined) fd.set("reason", reason);
    return fd;
  }
  const adminHdr = { cookie: adminCookie(), "x-csrf-token": "tok" };

  test("start: accepted → 204, status='in_progress', NO mail", async () => {
    const r = seedRequest();
    repo.addMessageAndTransition(r.id, null, "accepted", "2026-01-01T00:00:00.000Z");
    sent = [];
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
      method: "POST", headers: adminHdr, body: decisionForm("start"),
    }));
    expect(res.status).toBe(204);
    expect(repo.getRequest(r.id)?.status).toBe("in_progress");
    expect(sent.length).toBe(0);
  });

  test("complete: in_progress → 204, status='done', mail sent", async () => {
    const r = seedRequest();
    repo.addMessageAndTransition(r.id, null, "accepted", "2026-01-01T00:00:00.000Z");
    repo.addMessageAndTransition(r.id, null, "in_progress", "2026-01-01T00:00:00.000Z");
    sent = [];
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
      method: "POST", headers: adminHdr, body: decisionForm("complete"),
    }));
    expect(res.status).toBe(204);
    expect(repo.getRequest(r.id)?.status).toBe("done");
    expect(sent.some((m) => m.subject.includes("tamamlandı"))).toBe(true);
  });

  test("complete directly from accepted → 204, status='done' (skips in_progress)", async () => {
    const r = seedRequest();
    repo.addMessageAndTransition(r.id, null, "accepted", "2026-01-01T00:00:00.000Z");
    sent = [];
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
      method: "POST", headers: adminHdr, body: decisionForm("complete"),
    }));
    expect(res.status).toBe(204);
    expect(repo.getRequest(r.id)?.status).toBe("done");
    expect(sent.some((m) => m.subject.includes("tamamlandı"))).toBe(true);
  });

  test("cancel without reason → 400", async () => {
    const r = seedRequest();
    repo.addMessageAndTransition(r.id, null, "accepted", "2026-01-01T00:00:00.000Z");
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
      method: "POST", headers: adminHdr, body: decisionForm("cancel"),
    }));
    expect(res.status).toBe(400);
  });

  test("cancel with reason: accepted → 204, status='cancelled', mail sent", async () => {
    const r = seedRequest();
    repo.addMessageAndTransition(r.id, null, "accepted", "2026-01-01T00:00:00.000Z");
    sent = [];
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
      method: "POST", headers: adminHdr, body: decisionForm("cancel", "yapılamadı"),
    }));
    expect(res.status).toBe(204);
    expect(repo.getRequest(r.id)?.status).toBe("cancelled");
    expect(sent.some((m) => m.subject.includes("iptal edildi"))).toBe(true);
  });

  test("start from 'new' (pre-decision) → 409", async () => {
    const r = seedRequest();
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
      method: "POST", headers: adminHdr, body: decisionForm("start"),
    }));
    expect(res.status).toBe(409);
  });
});

// ─── GET /api/admin/requests/:id/export.md ───────────────────────────────────

describe("GET /api/admin/requests/:id/export.md", () => {
  test("admin → 200 markdown with attachment filename and title", async () => {
    const r = seedRequest("a@kokilmetal.com.tr");
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/export.md`, {
      headers: { cookie: adminCookie() },
    }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="${r.request_no}.md"`);
    const body = await res.text();
    expect(body).toContain(`# ${r.request_no} · My Title`);
    expect(body).toContain("## Yazışma");
  });

  test("non-admin → 403", async () => {
    const r = seedRequest("a@kokilmetal.com.tr");
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/export.md`, {
      headers: { cookie: userCookie() },
    }));
    expect(res.status).toBe(403);
  });

  test("unknown id → 404", async () => {
    const res = await handler(new Request("http://x/api/admin/requests/9999/export.md", {
      headers: { cookie: adminCookie() },
    }));
    expect(res.status).toBe(404);
  });
});
