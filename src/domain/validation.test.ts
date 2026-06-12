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
});
