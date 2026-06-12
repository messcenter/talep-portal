// src/server/routes/definitions.test.ts
// Integration tests for the Departments/Modules JSON API via makeHandler.
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
  db.exec("PRAGMA foreign_keys = ON;");
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
      mime TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL);
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
  `);
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
  memStore.clear();
  const deps: Deps = {
    config: cfg,
    repo,
    mailer: {
      async send() {},
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

/** Build a JSON POST/PUT/DELETE/PATCH Request with csrf. */
function jsonReq(method: string, path: string, body: unknown, cookie: string): Request {
  return new Request(`http://x${path}`, {
    method,
    body: JSON.stringify(body),
    headers: {
      cookie,
      "content-type": "application/json",
      "x-csrf-token": "tok",
    },
  });
}

// ─── GET /api/departments ─────────────────────────────────────────────────────

describe("GET /api/departments", () => {
  test("normal user → 200, returns departments with modules", async () => {
    // Seed one department with one module via repo
    const dept = repo.createDepartment("Muhasebe", "2026-01-01T00:00:00.000Z");
    repo.createModule(dept.id, "Faturalama", "2026-01-01T00:00:00.000Z");

    const res = await handler(new Request("http://x/api/departments", {
      headers: { cookie: userCookie() },
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0]!.name).toBe("Muhasebe");
    expect(Array.isArray(body[0]!.modules)).toBe(true);
    expect(body[0]!.modules.length).toBe(1);
    expect(body[0]!.modules[0]!.name).toBe("Faturalama");
  });
});

// ─── POST /api/admin/departments ─────────────────────────────────────────────

describe("POST /api/admin/departments", () => {
  test("admin with valid name → 201, {id} > 0", async () => {
    const res = await handler(jsonReq("POST", "/api/admin/departments", { name: "Muhasebe" }, adminCookie()));
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.id).toBeGreaterThan(0);
  });

  test("non-admin → 403", async () => {
    const res = await handler(jsonReq("POST", "/api/admin/departments", { name: "Muhasebe" }, userCookie()));
    expect(res.status).toBe(403);
  });

  test("whitespace-only name → 400", async () => {
    const res = await handler(jsonReq("POST", "/api/admin/departments", { name: "   " }, adminCookie()));
    expect(res.status).toBe(400);
  });

  test("duplicate name → 409", async () => {
    await handler(jsonReq("POST", "/api/admin/departments", { name: "İK" }, adminCookie()));
    const res = await handler(jsonReq("POST", "/api/admin/departments", { name: "İK" }, adminCookie()));
    expect(res.status).toBe(409);
  });

  test("no X-CSRF-Token header → 403 (handler csrf gate)", async () => {
    const res = await handler(new Request("http://x/api/admin/departments", {
      method: "POST",
      body: JSON.stringify({ name: "Test" }),
      headers: {
        cookie: adminCookie(),
        "content-type": "application/json",
        // no x-csrf-token
      },
    }));
    expect(res.status).toBe(403);
  });
});

// ─── POST /api/admin/departments/:id/modules ──────────────────────────────────

describe("POST /api/admin/departments/:id/modules", () => {
  test("admin, existing dept, valid name → 201, {id} > 0", async () => {
    const dept = repo.createDepartment("IT", "2026-01-01T00:00:00.000Z");
    const res = await handler(jsonReq("POST", `/api/admin/departments/${dept.id}/modules`, { name: "CRM" }, adminCookie()));
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.id).toBeGreaterThan(0);
  });

  test("duplicate module in same dept → 409", async () => {
    const dept = repo.createDepartment("IT", "2026-01-01T00:00:00.000Z");
    await handler(jsonReq("POST", `/api/admin/departments/${dept.id}/modules`, { name: "CRM" }, adminCookie()));
    const res = await handler(jsonReq("POST", `/api/admin/departments/${dept.id}/modules`, { name: "CRM" }, adminCookie()));
    expect(res.status).toBe(409);
  });

  test("nonexistent dept id → 404", async () => {
    const res = await handler(jsonReq("POST", "/api/admin/departments/99999/modules", { name: "CRM" }, adminCookie()));
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/admin/modules/:id ───────────────────────────────────────────

describe("DELETE /api/admin/modules/:id", () => {
  test("existing module → 204", async () => {
    const dept = repo.createDepartment("IT", "2026-01-01T00:00:00.000Z");
    const mod = repo.createModule(dept.id, "ERP", "2026-01-01T00:00:00.000Z");
    const res = await handler(new Request(`http://x/api/admin/modules/${mod.id}`, {
      method: "DELETE",
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(204);
  });

  test("nonexistent module → 404", async () => {
    const res = await handler(new Request(`http://x/api/admin/modules/99999`, {
      method: "DELETE",
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/admin/departments/:id ───────────────────────────────────────

describe("DELETE /api/admin/departments/:id", () => {
  test("existing dept → 204", async () => {
    const dept = repo.createDepartment("Finance", "2026-01-01T00:00:00.000Z");
    const res = await handler(new Request(`http://x/api/admin/departments/${dept.id}`, {
      method: "DELETE",
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(204);
  });

  test("nonexistent dept → 404", async () => {
    const res = await handler(new Request("http://x/api/admin/departments/99999", {
      method: "DELETE",
      headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(404);
  });
});
