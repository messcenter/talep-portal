// src/domain/export.test.ts
import { expect, test, describe } from "bun:test";
import { requestToMarkdown } from "./export";

const baseRequest = {
  request_no: "TLP-0001",
  title: "My Title",
  status: "clarifying" as const,
  priority: "high",
  request_type: "feature",
  department: "Lojistik",
  application: "ERP",
  module_area: null as string | null,
  requester_name: "Ada",
  requester_email: "ada@kokilmetal.com.tr",
  created_at: "2026-01-01T00:00:00.000Z",
  description: "İrsaliye ekranı yavaş.",
  expected_benefit: "Zaman kazancı.",
};

describe("requestToMarkdown", () => {
  test("renders the H1 with request_no and title", () => {
    const md = requestToMarkdown({ request: baseRequest, messages: [], attachments: [] });
    expect(md.startsWith("# TLP-0001 · My Title\n")).toBe(true);
  });

  test("renders the metadata table with Turkish labels", () => {
    const md = requestToMarkdown({ request: baseRequest, messages: [], attachments: [] });
    expect(md).toContain("| Durum | Netleştiriliyor |");
    expect(md).toContain("| Öncelik | Yüksek |");
    expect(md).toContain("| Tür | Yeni Özellik |");
    expect(md).toContain("| Departman | Lojistik |");
    expect(md).toContain("| Uygulama | ERP |");
    expect(md).toContain("| Talep eden | Ada (ada@kokilmetal.com.tr) |");
    expect(md).toContain("| Oluşturma | 2026-01-01T00:00:00.000Z |");
  });

  test("empty module_area renders an em dash", () => {
    const md = requestToMarkdown({ request: baseRequest, messages: [], attachments: [] });
    expect(md).toContain("| Modül / Alan | — |");
  });

  test("present module_area is shown", () => {
    const md = requestToMarkdown({ request: { ...baseRequest, module_area: "Sevkiyat" }, messages: [], attachments: [] });
    expect(md).toContain("| Modül / Alan | Sevkiyat |");
  });

  test("includes description and expected-benefit sections", () => {
    const md = requestToMarkdown({ request: baseRequest, messages: [], attachments: [] });
    expect(md).toContain("## Açıklama\n\nİrsaliye ekranı yavaş.");
    expect(md).toContain("## Beklenen Fayda\n\nZaman kazancı.");
  });

  test("no messages → placeholder", () => {
    const md = requestToMarkdown({ request: baseRequest, messages: [], attachments: [] });
    expect(md).toContain("## Yazışma\n\n_Henüz mesaj yok._");
  });

  test("renders each message with role label and timestamp", () => {
    const md = requestToMarkdown({
      request: baseRequest,
      messages: [
        { author_role: "admin", body: "Hangi ekran?", created_at: "2026-01-02T10:00:00.000Z" },
        { author_role: "requester", body: "İrsaliye listesi.", created_at: "2026-01-03T11:00:00.000Z" },
      ],
      attachments: [],
    });
    expect(md).toContain("### Yönetici · 2026-01-02T10:00:00.000Z\n\nHangi ekran?");
    expect(md).toContain("### Talep eden · 2026-01-03T11:00:00.000Z\n\nİrsaliye listesi.");
  });

  test("no attachments → placeholder", () => {
    const md = requestToMarkdown({ request: baseRequest, messages: [], attachments: [] });
    expect(md).toContain("## Ekler\n\n_Ek yok._");
  });

  test("attachments → bullet list of names only", () => {
    const md = requestToMarkdown({
      request: baseRequest,
      messages: [],
      attachments: [{ original_name: "ekran.png" }, { original_name: "rapor.pdf" }],
    });
    expect(md).toContain("## Ekler\n\n- ekran.png\n- rapor.pdf");
  });

  test("falls back to raw value for unknown priority/type", () => {
    const md = requestToMarkdown({ request: { ...baseRequest, priority: "urgent", request_type: "other" }, messages: [], attachments: [] });
    expect(md).toContain("| Öncelik | urgent |");
    expect(md).toContain("| Tür | other |");
  });

  test("escapes pipe and newline in metadata cells so the table is not broken", () => {
    const md = requestToMarkdown({ request: { ...baseRequest, department: "A|B", application: "x\ny" }, messages: [], attachments: [] });
    expect(md).toContain("| Departman | A\\|B |");
    expect(md).toContain("| Uygulama | x y |");
  });

  test("collapses a newline in the title for the H1", () => {
    const md = requestToMarkdown({ request: { ...baseRequest, title: "Line1\nLine2" }, messages: [], attachments: [] });
    expect(md.startsWith("# TLP-0001 · Line1 Line2\n")).toBe(true);
  });
});
