// src/db/repo.test.ts
import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { openDb } from "./db";
import { makeRepo, type Repo, type AttachmentInput } from "./repo";

let repo: Repo;

beforeEach(() => {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  repo = makeRepo(seedSchema(db));
});

function seedSchema(db: Database): Database {
  db.exec(`
    CREATE TABLE requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_no TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
      requester_name TEXT NOT NULL, requester_email TEXT NOT NULL,
      department TEXT NOT NULL, application TEXT NOT NULL,
      module_area TEXT NOT NULL DEFAULT '', request_type TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL,
      expected_benefit TEXT NOT NULL, priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new');
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

const baseInput = {
  requester_name: "A",
  requester_email: "a@kokilmetal.com.tr",
  department: "Satın alma",
  application: "ERP",
  module_area: "",
  request_type: "feature",
  title: "Kalıp modülü",
  description: "detay",
  expected_benefit: "fayda",
  priority: "high",
};

describe("repo.createRequest", () => {
  test("assigns sequential request_no and status new", () => {
    const r1 = repo.createRequest(baseInput, "2026-06-12T00:00:00Z");
    const r2 = repo.createRequest(baseInput, "2026-06-12T00:01:00Z");
    expect(r1.request_no).toBe("TALEP-0001");
    expect(r2.request_no).toBe("TALEP-0002");
    expect(r1.status).toBe("new");
  });
});

describe("repo messages + status", () => {
  test("addMessage and listMessages roundtrip", () => {
    const r = repo.createRequest(baseInput, "2026-06-12T00:00:00Z");
    repo.addMessage(r.id, "admin", "soru?", "2026-06-12T01:00:00Z");
    repo.addMessage(r.id, "requester", "cevap", "2026-06-12T02:00:00Z");
    const msgs = repo.listMessages(r.id);
    expect(msgs.map((m) => m.author_role)).toEqual(["admin", "requester"]);
  });
  test("updateStatus persists", () => {
    const r = repo.createRequest(baseInput, "2026-06-12T00:00:00Z");
    repo.updateStatus(r.id, "clarifying");
    expect(repo.getRequest(r.id)?.status).toBe("clarifying");
  });
});

describe("repo listing", () => {
  test("listByEmail returns only that requester", () => {
    repo.createRequest(baseInput, "t");
    repo.createRequest({ ...baseInput, requester_email: "b@kokilmetal.com.tr" }, "t");
    expect(repo.listByEmail("a@kokilmetal.com.tr").length).toBe(1);
  });
  test("listAll filters by status", () => {
    const r = repo.createRequest(baseInput, "t");
    repo.createRequest(baseInput, "t");
    repo.updateStatus(r.id, "accepted");
    expect(repo.listAll({ status: "accepted" }).length).toBe(1);
    expect(repo.listAll({}).length).toBe(2);
  });
});

describe("updateStatus invariant", () => {
  test("rejects illegal transition out of terminal state", () => {
    const r = repo.createRequest(baseInput, "t");
    repo.updateStatus(r.id, "accepted");
    expect(() => repo.updateStatus(r.id, "clarifying")).toThrow();
    expect(repo.getRequest(r.id)?.status).toBe("accepted");
  });
  test("throws when request does not exist", () => {
    expect(() => repo.updateStatus(9999, "clarifying")).toThrow();
  });
});

describe("addMessageAndTransition (atomic)", () => {
  test("adds message and transitions together", () => {
    const r = repo.createRequest(baseInput, "t");
    repo.addMessageAndTransition(r.id, { role: "admin", body: "soru?" }, "clarifying", "t2");
    expect(repo.getRequest(r.id)?.status).toBe("clarifying");
    expect(repo.listMessages(r.id).length).toBe(1);
  });
  test("transitions with no message when message is null", () => {
    const r = repo.createRequest(baseInput, "t");
    repo.addMessageAndTransition(r.id, null, "accepted", "t2");
    expect(repo.getRequest(r.id)?.status).toBe("accepted");
    expect(repo.listMessages(r.id).length).toBe(0);
  });
  test("rolls back the message insert on illegal transition", () => {
    const r = repo.createRequest(baseInput, "t");
    repo.updateStatus(r.id, "accepted");
    expect(() =>
      repo.addMessageAndTransition(r.id, { role: "admin", body: "x" }, "clarifying", "t2"),
    ).toThrow();
    expect(repo.listMessages(r.id).length).toBe(0);
    expect(repo.getRequest(r.id)?.status).toBe("accepted");
  });
});

describe("attachments", () => {
  const sample = baseInput;
  const att = (over: Partial<AttachmentInput> = {}) => ({
    storage_key: "k1.png", original_name: "shot.png",
    mime: "image/png", size_bytes: 123, ...over,
  });

  test("createRequest stores request-level attachments (message_id null)", () => {
    const r = repo.createRequest(sample, "t", [att(), att({ storage_key: "k2.pdf", mime: "application/pdf" })]);
    const list = repo.listAttachmentsByRequest(r.id);
    expect(list.length).toBe(2);
    expect(list[0]!.request_id).toBe(r.id);
    expect(list[0]!.message_id).toBeNull();
  });

  test("addMessageAndTransition attaches files to the new message", () => {
    const r = repo.createRequest(sample, "t");
    repo.updateStatus(r.id, "clarifying");
    repo.addMessageAndTransition(
      r.id, { role: "requester", body: "cevap" }, "answered", "t",
      [att({ storage_key: "k3.png" })],
    );
    const list = repo.listAttachmentsByRequest(r.id);
    expect(list.length).toBe(1);
    expect(list[0]!.message_id).toBe(repo.listMessages(r.id)[0]!.id);
  });

  test("getAttachment returns row or null", () => {
    const r = repo.createRequest(sample, "t", [att()]);
    const id = repo.listAttachmentsByRequest(r.id)[0]!.id;
    expect(repo.getAttachment(id)?.storage_key).toBe("k1.png");
    expect(repo.getAttachment(999999)).toBeNull();
  });
});

describe("departments + modules", () => {
  test("departments + modules CRUD with cascade", () => {
    const d1 = repo.createDepartment("Üretim", "2026-01-01T00:00:00Z");
    const d2 = repo.createDepartment("Muhasebe", "2026-01-01T00:00:00Z");
    expect(d1.id).toBeGreaterThan(0);
    const m1 = repo.createModule(d1.id, "Stok", "2026-01-01T00:00:00Z");
    repo.createModule(d1.id, "Planlama", "2026-01-01T00:00:00Z");

    const list = repo.listDepartmentsWithModules();
    const uretim = list.find((d) => d.name === "Üretim")!;
    expect(uretim.modules.map((m) => m.name).sort()).toEqual(["Planlama", "Stok"]);
    expect(list.find((d) => d.name === "Muhasebe")!.modules).toEqual([]);

    expect(repo.getDepartmentByName("Üretim")?.id).toBe(d1.id);
    expect(repo.getDepartmentByName("Yok")).toBeNull();
    expect(repo.getDepartment(d1.id)?.name).toBe("Üretim");
    expect(repo.listModuleNames(d1.id).sort()).toEqual(["Planlama", "Stok"]);

    repo.deleteDepartment(d1.id);
    expect(repo.getDepartmentByName("Üretim")).toBeNull();
    expect(repo.listModuleNames(d1.id)).toEqual([]); // cascade removed modules
    void d2; void m1;
  });

  test("duplicate department name throws", () => {
    repo.createDepartment("İK", "2026-01-01T00:00:00Z");
    expect(() => repo.createDepartment("İK", "2026-01-01T00:00:00Z")).toThrow();
  });

  test("duplicate module within a department throws", () => {
    const d = repo.createDepartment("Satış", "2026-01-01T00:00:00Z");
    repo.createModule(d.id, "CRM", "2026-01-01T00:00:00Z");
    expect(() => repo.createModule(d.id, "CRM", "2026-01-01T00:00:00Z")).toThrow();
  });
});
