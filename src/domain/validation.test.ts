// src/domain/validation.test.ts
import { expect, test, describe } from "bun:test";
import { newRequestSchema, replySchema, decisionSchema } from "./validation";

describe("newRequestSchema", () => {
  const valid = {
    department: "Satın alma",
    application: "ERP",
    module_area: "",
    request_type: "feature",
    title: "Kalıp modülü",
    description: "Kalıp malzemeleri için ayrı modül",
    expected_benefit: "Takip kolaylaşır",
    priority: "high",
  };
  test("accepts valid input", () => {
    expect(newRequestSchema.safeParse(valid).success).toBe(true);
  });
  test("related_departments optional, defaults to []", () => {
    const r = newRequestSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.related_departments).toEqual([]);
  });
  test("related_departments accepts up to 10", () => {
    const arr = Array.from({ length: 10 }, (_, i) => `D${i}`);
    expect(newRequestSchema.safeParse({ ...valid, related_departments: arr }).success).toBe(true);
  });
  test("related_departments rejects more than 10", () => {
    const arr = Array.from({ length: 11 }, (_, i) => `D${i}`);
    expect(newRequestSchema.safeParse({ ...valid, related_departments: arr }).success).toBe(false);
  });
  test("rejects empty title", () => {
    expect(newRequestSchema.safeParse({ ...valid, title: "" }).success).toBe(
      false,
    );
  });
  test("rejects unknown request_type", () => {
    expect(
      newRequestSchema.safeParse({ ...valid, request_type: "xxx" }).success,
    ).toBe(false);
  });
  test("rejects unknown priority", () => {
    expect(
      newRequestSchema.safeParse({ ...valid, priority: "urgent" }).success,
    ).toBe(false);
  });
});

describe("replySchema", () => {
  test("rejects blank body", () => {
    expect(replySchema.safeParse({ body: "  " }).success).toBe(false);
  });
  test("accepts non-empty body", () => {
    expect(replySchema.safeParse({ body: "cevabım" }).success).toBe(true);
  });
});

describe("decisionSchema", () => {
  test("accept without reason is valid", () => {
    expect(decisionSchema.safeParse({ decision: "accept" }).success).toBe(true);
  });
  test("reject requires reason", () => {
    expect(decisionSchema.safeParse({ decision: "reject" }).success).toBe(
      false,
    );
    expect(
      decisionSchema.safeParse({ decision: "reject", reason: "uygun değil" })
        .success,
    ).toBe(true);
  });
  test("start/complete without reason are valid", () => {
    expect(decisionSchema.safeParse({ decision: "start" }).success).toBe(true);
    expect(decisionSchema.safeParse({ decision: "complete" }).success).toBe(true);
  });
  test("cancel requires reason", () => {
    expect(decisionSchema.safeParse({ decision: "cancel" }).success).toBe(false);
    expect(
      decisionSchema.safeParse({ decision: "cancel", reason: "yapılamadı" }).success,
    ).toBe(true);
  });
  test("unknown decision value is rejected", () => {
    expect(decisionSchema.safeParse({ decision: "frobnicate" }).success).toBe(false);
  });
});

test("newRequestSchema: Türkçe alan mesajları", () => {
  const r = newRequestSchema.safeParse({ department: "", application: "ERP", request_type: "", title: "", description: "x", expected_benefit: "y", priority: "" });
  expect(r.success).toBe(false);
  if (!r.success) {
    const byPath = Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
    expect(byPath["department"]).toBe("Departman gerekli");
    expect(byPath["title"]).toBe("Başlık gerekli");
    expect(byPath["request_type"]).toBe("Talep türü seçiniz");
    expect(byPath["priority"]).toBe("Öncelik seçiniz");
  }
});

test("title max message Türkçe", () => {
  const r = newRequestSchema.safeParse({ department: "D", application: "ERP", request_type: "bug", title: "x".repeat(201), description: "d", expected_benefit: "b", priority: "low" });
  expect(r.success).toBe(false);
  if (!r.success) expect(r.error.issues.find((i) => i.path[0] === "title")?.message).toBe("Başlık en fazla 200 karakter olabilir");
});

test("decision reject without reason Türkçe", () => {
  const r = decisionSchema.safeParse({ decision: "reject" });
  expect(r.success).toBe(false);
  if (!r.success) expect(r.error.issues[0]?.message).toBe("Gerekçe gerekli");
});
