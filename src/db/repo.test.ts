// src/db/repo.test.ts
import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { openDb } from "./db";
import { makeRepo, type Repo } from "./repo";

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
