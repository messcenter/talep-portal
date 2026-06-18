import { expect, test, describe } from "bun:test";
import {
  newRequestAdmin, newRequestRequester, replyAdmin, questionRequester, decisionRequester,
  subscriberMessage, subscriberDecision, subscriberWelcome,
} from "./templates";
import type { RequestRow } from "../db/repo";

const base = "http://localhost:3000";
function row(over: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 7, request_no: "TALEP-0007", created_at: "2026-01-01T00:00:00Z",
    requester_name: "Ali", requester_email: "ali@x.com", department: "Üretim",
    application: "ERP", module_area: "Stok", request_type: "feature",
    title: "Barkod desteği", description: "d", expected_benefit: "f",
    priority: "high", status: "new", ...over,
  } as RequestRow;
}

describe("mail templates", () => {
  test("newRequestAdmin: subject, admin CTA url, escaped title", () => {
    const m = newRequestAdmin(row(), base);
    expect(m.subject).toBe("Yeni talep: TALEP-0007");
    expect(m.html).toContain(`${base}/admin/requests/7`);
    expect(m.html).toContain("Barkod desteği");
    expect(m.text).toContain("TALEP-0007");
    expect(m.text).toContain(`${base}/admin/requests/7`);
  });
  test("newRequestRequester: requester CTA url", () => {
    const m = newRequestRequester(row(), base);
    expect(m.subject).toBe("Talebiniz alındı: TALEP-0007");
    expect(m.html).toContain(`${base}/requests/7`);
  });
  test("replyAdmin: admin url + subject", () => {
    const m = replyAdmin(row(), base);
    expect(m.subject).toBe("Cevaplandı: TALEP-0007");
    expect(m.html).toContain(`${base}/admin/requests/7`);
  });
  test("questionRequester: requester url + subject", () => {
    const m = questionRequester(row(), base);
    expect(m.subject).toBe("Talebiniz hakkında soru: TALEP-0007");
    expect(m.html).toContain(`${base}/requests/7`);
  });
  test("decisionRequester accept (no reason): subject + no Not block", () => {
    const m = decisionRequester(row(), base, "accepted");
    expect(m.subject).toBe("Talep kabul edildi: TALEP-0007");
    expect(m.html).toContain(`${base}/requests/7`);
    expect(m.html).not.toContain("Not:");
  });
  test("decisionRequester reject with reason: subject + escaped reason", () => {
    const m = decisionRequester(row(), base, "rejected", "uygun <değil>");
    expect(m.subject).toBe("Talep reddedildi: TALEP-0007");
    expect(m.html).toContain("Not:");
    expect(m.html).toContain("uygun &lt;değil&gt;");
  });
  test("decisionRequester done: subject Türkçe", () => {
    const m = decisionRequester(row(), base, "done");
    expect(m.subject).toBe("Talep tamamlandı: TALEP-0007");
  });
  test("decisionRequester cancelled with reason: subject + escaped reason", () => {
    const m = decisionRequester(row(), base, "cancelled", "uygun <değil>");
    expect(m.subject).toBe("Talep iptal edildi: TALEP-0007");
    expect(m.html).toContain("uygun &lt;değil&gt;");
  });
  test("XSS: title is HTML-escaped in html", () => {
    const m = newRequestAdmin(row({ title: "<script>alert(1)</script>" }), base);
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).not.toContain("<script>alert(1)</script>");
  });
});

describe("subscriber templates", () => {
  test("subscriberMessage: subject + /requests/ url + byName + role", () => {
    const m = subscriberMessage(row(), base, "Ayşe", "admin");
    expect(m.subject).toBe("Güncelleme: TALEP-0007");
    expect(m.html).toContain(`${base}/requests/7`);
    expect(m.html).toContain("Ayşe");
    expect(m.html).toContain("yönetici");
  });
  test("subscriberMessage: requester role label", () => {
    const m = subscriberMessage(row(), base, "Ali", "requester");
    expect(m.html).toContain("talep sahibi");
  });
  test("subscriberDecision: done label + reason escaped", () => {
    const m = subscriberDecision(row(), base, "done", "x <b>");
    expect(m.subject).toBe("Takip ettiğiniz talep tamamlandı: TALEP-0007");
    expect(m.html).toContain("tamamlandı");
    expect(m.html).toContain("x &lt;b&gt;");
  });
  test("subscriberDecision: cancelled without reason has no Not block", () => {
    const m = subscriberDecision(row(), base, "cancelled");
    expect(m.subject).toContain("iptal edildi");
    expect(m.html).not.toContain("Not:");
  });
  test("subscriberWelcome: addedByName + /requests/ url", () => {
    const m = subscriberWelcome(row(), base, "Mehmet");
    expect(m.subject).toBe("Takipçi olarak eklendiniz: TALEP-0007");
    expect(m.html).toContain("Mehmet");
    expect(m.html).toContain(`${base}/requests/7`);
  });
});
