import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { makeRepo, type Repo } from "../db/repo";
import { makeMailer } from "../mail/mailer";
import { signSession } from "../auth/session";
import { buildApp } from "../app";
import { loadConfig } from "../config";

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
      author_role TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);`);
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
  app = buildApp({ config: cfg, repo, mailer, now: () => "2026-06-12T00:00:00Z" });
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
});
