# Talep → Markdown Export (Admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bir admin'in tek talebi (metadata + soru-cevap akışı + ek adları) `GET /api/admin/requests/:id/export.md` üzerinden `.md` dosyası olarak indirebilmesi.

**Architecture:** Saf bir `requestToMarkdown()` formatter `src/domain/export.ts`'te (zero I/O, exhaustive unit test). Admin-only sunucu route'u `src/server/routes/admin.ts`'e eklenir; mevcut repo'dan veriyi çekip formatter'ı çağırır ve `text/markdown` + `Content-Disposition` ile döner. İstemcide `RequestDetailAdmin` sayfasına bu URL'ye giden `<a download>` düğmesi eklenir.

**Tech Stack:** Bun + `Bun.serve` + `bun:sqlite`, React 19 + TS, `bun:test`.

---

## File Structure

- **Create** `src/domain/export.ts` — saf `requestToMarkdown(data)` + dar export tipleri + Türkçe öncelik/tür label map'leri. Zero I/O.
- **Create** `src/domain/export.test.ts` — formatter birim testleri.
- **Modify** `src/server/routes/admin.ts` — `handleAdmin` dispatcher'ına `GET /api/admin/requests/:id/export.md` dalı + `requestToMarkdown` importu.
- **Modify** `src/server/routes/admin.test.ts` — export route entegrasyon testleri.
- **Modify** `src/client/pages/RequestDetailAdmin.tsx` — "Markdown indir" `<a download>` düğmesi.

Mevcut `src/domain/status.ts` (`statusLabelTr`), repo metotları (`getRequest`, `listMessages`, `listAttachmentsByRequest`) ve `json` helper aynen kullanılır.

---

### Task 1: Saf formatter — `requestToMarkdown` (domain)

**Files:**
- Create: `src/domain/export.ts`
- Test: `src/domain/export.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/domain/export.test.ts`
Expected: FAIL — `Cannot find module './export'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/export.ts
// Pure formatter: a single request → a Markdown document. Zero I/O.
import { type RequestStatus, statusLabelTr } from "./status";

export interface ExportRequest {
  request_no: string;
  title: string;
  status: RequestStatus;
  priority: string;
  request_type: string;
  department: string;
  application: string;
  module_area: string | null;
  requester_name: string;
  requester_email: string;
  created_at: string;
  description: string;
  expected_benefit: string;
}

export interface ExportMessage {
  author_role: "admin" | "requester";
  body: string;
  created_at: string;
}

export interface ExportAttachment {
  original_name: string;
}

// Turkish labels. Priority/type maps live here (domain may not import the
// client labels.ts; small, stable duplication is accepted — see design doc).
const PRIORITY_LABEL_TR: Record<string, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
};

const REQUEST_TYPE_LABEL_TR: Record<string, string> = {
  feature: "Yeni Özellik",
  bug: "Hata",
  task: "Görev",
};

const ROLE_LABEL_TR: Record<ExportMessage["author_role"], string> = {
  admin: "Yönetici",
  requester: "Talep eden",
};

/** Collapse newlines to spaces (for single-line contexts like the H1). */
function inlineText(s: string): string {
  return s.replace(/\r?\n/g, " ").trim();
}

/** Escape a value for a Markdown table cell: no newlines, escaped pipes. */
function cell(s: string): string {
  return inlineText(s).replace(/\|/g, "\\|");
}

export function requestToMarkdown(data: {
  request: ExportRequest;
  messages: ExportMessage[];
  attachments: ExportAttachment[];
}): string {
  const { request: r, messages, attachments } = data;

  const lines: string[] = [];
  lines.push(`# ${r.request_no} · ${inlineText(r.title)}`);
  lines.push("");
  lines.push("| Alan | Değer |");
  lines.push("|---|---|");
  lines.push(`| Durum | ${cell(statusLabelTr(r.status))} |`);
  lines.push(`| Öncelik | ${cell(PRIORITY_LABEL_TR[r.priority] ?? r.priority)} |`);
  lines.push(`| Tür | ${cell(REQUEST_TYPE_LABEL_TR[r.request_type] ?? r.request_type)} |`);
  lines.push(`| Departman | ${cell(r.department)} |`);
  lines.push(`| Uygulama | ${cell(r.application)} |`);
  lines.push(`| Modül / Alan | ${r.module_area ? cell(r.module_area) : "—"} |`);
  lines.push(`| Talep eden | ${cell(`${r.requester_name} (${r.requester_email})`)} |`);
  lines.push(`| Oluşturma | ${cell(r.created_at)} |`);
  lines.push("");
  lines.push("## Açıklama");
  lines.push("");
  lines.push(r.description);
  lines.push("");
  lines.push("## Beklenen Fayda");
  lines.push("");
  lines.push(r.expected_benefit);
  lines.push("");
  lines.push("## Yazışma");
  lines.push("");
  if (messages.length === 0) {
    lines.push("_Henüz mesaj yok._");
  } else {
    messages.forEach((m, i) => {
      lines.push(`### ${ROLE_LABEL_TR[m.author_role]} · ${m.created_at}`);
      lines.push("");
      lines.push(m.body);
      if (i < messages.length - 1) lines.push("");
    });
  }
  lines.push("");
  lines.push("## Ekler");
  lines.push("");
  if (attachments.length === 0) {
    lines.push("_Ek yok._");
  } else {
    for (const a of attachments) lines.push(`- ${a.original_name}`);
  }
  lines.push("");

  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/domain/export.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/export.ts src/domain/export.test.ts
git commit -m "feat: add pure requestToMarkdown formatter"
```

---

### Task 2: Admin export route — `GET /api/admin/requests/:id/export.md`

**Files:**
- Modify: `src/server/routes/admin.ts`
- Test: `src/server/routes/admin.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/server/routes/admin.test.ts` (after the existing `GET /api/admin/requests` describe block; the helpers `adminCookie`, `userCookie`, `seedRequest`, `handler`, `repo` already exist in this file)

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/routes/admin.test.ts`
Expected: FAIL — the new export tests fail (route not matched → falls through to 404 for the admin case, and the content-type/body assertions fail).

- [ ] **Step 3: Write minimal implementation**

In `src/server/routes/admin.ts`, add the import at the top (with the other domain imports):

```ts
import { requestToMarkdown } from "../../domain/export";
```

Then add this branch inside `handleAdmin`, immediately AFTER the `GET /api/admin/requests` list block and BEFORE the `POST /api/admin/requests/:id/message` block:

```ts
  // GET /api/admin/requests/:id/export.md
  const exportMatch = path.match(/^\/api\/admin\/requests\/(\d+)\/export\.md$/);
  if (exportMatch && method === "GET") {
    if (!user.isAdmin) return json({ error: "Yetkisiz" }, 403, extraHeaders);
    const id = Number(exportMatch[1]);
    if (!Number.isInteger(id)) return json({ error: "not found" }, 404, extraHeaders);
    const r = deps.repo.getRequest(id);
    if (!r) return json({ error: "not found" }, 404, extraHeaders);
    const md = requestToMarkdown({
      request: r,
      messages: deps.repo.listMessages(r.id),
      attachments: deps.repo.listAttachmentsByRequest(r.id),
    });
    const headers = new Headers({
      ...extraHeaders,
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${r.request_no}.md"`,
    });
    return new Response(md, { status: 200, headers });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/server/routes/admin.test.ts`
Expected: PASS — including the three new export tests.

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `bun test`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/admin.ts src/server/routes/admin.test.ts
git commit -m "feat: add admin GET /api/admin/requests/:id/export.md route"
```

---

### Task 3: "Markdown indir" button on the admin detail page

**Files:**
- Modify: `src/client/pages/RequestDetailAdmin.tsx`

This is presentational; no new test. Build must pass and the full suite stays green.

- [ ] **Step 1: Add the download button**

In `src/client/pages/RequestDetailAdmin.tsx`, in the final `return (...)` block, insert the button as the FIRST child inside `<main ...>`, before `<RequestMeta .../>`:

```tsx
  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex justify-end mb-3">
        <a
          href={`/api/admin/requests/${req.id}/export.md`}
          download
          className="inline-flex items-center gap-1.5 rounded border border-border-subtle bg-white px-3 py-1.5 text-sm font-medium text-on-surface hover:bg-surface-tonal transition-colors no-underline"
        >
          ⬇ Markdown indir
        </a>
      </div>
      <RequestMeta req={req} requestAtts={requestAtts} />
      {/* ...rest unchanged... */}
```

Leave everything else in the file unchanged.

- [ ] **Step 2: Run the full suite**

Run: `bun test`
Expected: PASS (no behavior changed).

- [ ] **Step 3: Verify the build (type + bundle)**

Run: `bun run build`
Expected: `build:css` and `build:client` complete with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/client/pages/RequestDetailAdmin.tsx
git commit -m "feat: add Markdown download button to admin request detail"
```

---

### Task 4: Manual smoke (light)

**Files:** none. The route contract is fully covered by Task 2's integration tests; this is a quick UI confirmation. Optional if a logged-in admin environment isn't readily available.

- [ ] **Step 1:** Start the app against a real/seeded DB with an admin session and open an admin request detail at `/admin/requests/:id`.
- [ ] **Step 2:** Confirm the "⬇ Markdown indir" button appears top-right above the metadata.
- [ ] **Step 3:** Click it; confirm the browser downloads `<request_no>.md` and that opening the file shows the H1, the metadata table (Turkish labels), Açıklama/Beklenen Fayda, the Yazışma thread, and the Ekler name list.

---

## Self-Review Notları

- **Spec kapsamı:** formatter (Task 1), admin-only route + headers/filename + 403/404 (Task 2), istemci düğmesi yalnız admin detayında (Task 3), eklerde sadece ad (Task 1 — bullet list of `original_name`), Türkçe label'lar (`statusLabelTr` + yerel öncelik/tür map), markdown tablo kaçışı (Task 1 `cell`). Hepsi karşılandı.
- **Kapsam dışı korundu:** liste export'u, çalışan tarafı düğmesi, ek indirme linki, PDF, GitHub issue — hiçbiri eklenmedi.
- **Tip tutarlılığı:** `requestToMarkdown({ request, messages, attachments })` imzası Task 1 ve Task 2'de aynı; `ExportRequest`/`ExportMessage`/`ExportAttachment` alanları repo satırlarıyla yapısal uyumlu (`RequestRow`/`MessageRow`/`AttachmentRow` üst kümeleri).
- **Determinizm:** formatter `created_at`'i ham ISO olarak basar (domain'de `Date`/locale yok → testler deterministik).
