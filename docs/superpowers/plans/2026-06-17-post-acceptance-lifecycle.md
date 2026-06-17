# Kabul Sonrası Yaşam Döngüsü Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Talep durum makinesine `in_progress` (Yapılıyor), `done` (Tamamlandı) ve `cancelled` (İptal edildi) durumlarını ekleyip `accepted`'ı terminal olmaktan çıkarmak; admin'in kabul edilen talepleri ileri taşıyabilmesi.

**Architecture:** SSoT `src/domain/status.ts`'te FSM verisi güncellenir; tüm geçiş legalliği zaten `canTransition` (route 409) + repo throw ile zorlanır, mantık değişmez. Admin karar endpoint'i (`/decision`) genişletilmiş bir `decisionSchema` ile beş karar değerini (accept/reject/start/complete/cancel) hedef duruma eşler. İstemci tarafı duruma göre buton seti gösterir.

**Tech Stack:** Bun + bun:sqlite, Zod, React 19 + Tailwind/shadcn, nodemailer. Testler `bun test` (bun:sqlite in-memory + mock auth/mail), istemci bileşen testleri `renderToStaticMarkup`.

**Karar → hedef durum eşlemesi (referans):**

| decision değeri | hedef durum | gerekçe | mail |
|---|---|---|---|
| `accept` | `accepted` | opsiyonel | ✅ |
| `reject` | `rejected` | **zorunlu** | ✅ |
| `start` | `in_progress` | opsiyonel | ❌ |
| `complete` | `done` | opsiyonel | ✅ |
| `cancel` | `cancelled` | **zorunlu** | ✅ |

**Renk token'ları (tailwind):** `status.yapiliyor = #5E35B1`, `status.tamam = #00897B`, `status.iptal = #607D8B`.

---

## File Structure

- **Modify** `src/domain/status.ts` — 3 yeni slug, TERMINAL/ALLOWED/LABELS güncel.
- **Modify** `src/domain/status.test.ts` — yeni geçiş/terminal/label testleri.
- **Modify** `src/domain/validation.ts` — `decisionSchema` 5 değerli enum + reason refine.
- **Modify** `src/domain/validation.test.ts` — yeni karar değerleri + mesaj.
- **Modify** `src/domain/stats.ts` — `byStatus` literal'ine 3 yeni durum.
- **Modify** `src/domain/stats.test.ts` — yeni durumların sayımı.
- **Modify** `src/mail/templates.ts` — `decisionRequester` hedef tipi genişler.
- **Modify** `src/mail/templates.test.ts` — done/cancelled label testleri.
- **Modify** `src/server/routes/admin.ts` — `/decision` handler hedef eşlemesi + mail.
- **Modify** `src/server/routes/admin.test.ts` — start/complete/cancel entegrasyon testleri.
- **Modify** `tailwind.config.ts` — 3 yeni status renk token'ı.
- **Modify** `src/client/components/StatusBadge.tsx` — TINT 3 yeni durum.
- **Modify** `src/client/components/StatusBadge.test.tsx` — yeni label testleri.
- **Modify** `src/client/pages/Dashboard.tsx` — `STATUS_ORDER` + `STATUS_BAR`.
- **Modify** `src/client/pages/Admin.tsx` — `STATUSES` filtre listesi.
- **Modify** `src/client/components/AdminControls.tsx` — `adminActionsFor` helper + duruma göre kontroller.
- **Create** `src/client/components/AdminControls.test.tsx` — `adminActionsFor` saf birim testi.

---

## Task 1: Domain durum makinesi

**Files:**
- Modify: `src/domain/status.ts`
- Test: `src/domain/status.test.ts`

- [ ] **Step 1: Başarısız testleri yaz**

`src/domain/status.test.ts` içindeki `describe("status state machine", ...)` bloğuna şu testleri **ekle** (mevcut testlere dokunma):

```typescript
  test("accepted is no longer terminal; advances to in_progress/done/cancelled", () => {
    expect(isTerminal("accepted")).toBe(false);
    expect(canTransition("accepted", "in_progress")).toBe(true);
    expect(canTransition("accepted", "done")).toBe(true);
    expect(canTransition("accepted", "cancelled")).toBe(true);
  });
  test("in_progress advances to done/cancelled only", () => {
    expect(canTransition("in_progress", "done")).toBe(true);
    expect(canTransition("in_progress", "cancelled")).toBe(true);
    expect(canTransition("in_progress", "accepted")).toBe(false);
    expect(canTransition("in_progress", "rejected")).toBe(false);
  });
  test("done and cancelled are terminal", () => {
    expect(isTerminal("done")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(canTransition("done", "in_progress")).toBe(false);
    expect(canTransition("cancelled", "accepted")).toBe(false);
  });
  test("cannot reject/cancel from pre-decision into in_progress/done", () => {
    expect(canTransition("new", "in_progress")).toBe(false);
    expect(canTransition("new", "done")).toBe(false);
    expect(canTransition("new", "cancelled")).toBe(false);
  });
  test("TR labels for new statuses", () => {
    expect(statusLabelTr("in_progress")).toBe("Yapılıyor");
    expect(statusLabelTr("done")).toBe("Tamamlandı");
    expect(statusLabelTr("cancelled")).toBe("İptal edildi");
  });
```

Ayrıca mevcut `"terminal statuses cannot transition out"` testindeki `expect(isTerminal("accepted")).toBe(true)` satırını **sil** (accepted artık terminal değil) — kalan `rejected` assertion'ları kalsın.

- [ ] **Step 2: Testi koştur, başarısız olduğunu gör**

Run: `bun test src/domain/status.test.ts`
Expected: FAIL — `canTransition("accepted", "in_progress")` false döner, `statusLabelTr("in_progress")` undefined, TS tip hataları (yeni sluglar `RequestStatus`'ta yok).

- [ ] **Step 3: status.ts'i güncelle**

`src/domain/status.ts`'i tümüyle şu içerikle değiştir:

```typescript
// src/domain/status.ts
export type RequestStatus =
  | "new"
  | "clarifying"
  | "answered"
  | "accepted"
  | "in_progress"
  | "done"
  | "rejected"
  | "cancelled";

const TERMINAL: ReadonlySet<RequestStatus> = new Set(["done", "rejected", "cancelled"]);

const ALLOWED: Record<RequestStatus, ReadonlySet<RequestStatus>> = {
  new: new Set(["clarifying", "accepted", "rejected"]),
  clarifying: new Set(["answered", "accepted", "rejected"]),
  answered: new Set(["clarifying", "accepted", "rejected"]),
  accepted: new Set(["in_progress", "done", "cancelled"]),
  in_progress: new Set(["done", "cancelled"]),
  done: new Set(),
  rejected: new Set(),
  cancelled: new Set(),
};

const LABELS_TR: Record<RequestStatus, string> = {
  new: "Yeni",
  clarifying: "Netleştiriliyor",
  answered: "Cevaplandı",
  accepted: "Kabul edildi",
  in_progress: "Yapılıyor",
  done: "Tamamlandı",
  rejected: "Reddedildi",
  cancelled: "İptal edildi",
};

export function isTerminal(s: RequestStatus): boolean {
  return TERMINAL.has(s);
}

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return ALLOWED[from].has(to);
}

export function statusLabelTr(s: RequestStatus): string {
  return LABELS_TR[s];
}
```

- [ ] **Step 4: Testi koştur, geçtiğini gör**

Run: `bun test src/domain/status.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/status.ts src/domain/status.test.ts
git commit -m "feat(domain): add in_progress/done/cancelled statuses to FSM"
```

---

## Task 2: Karar şeması (5 değer + cancel gerekçesi)

**Files:**
- Modify: `src/domain/validation.ts:25-34`
- Test: `src/domain/validation.test.ts`

- [ ] **Step 1: Başarısız testleri yaz**

`src/domain/validation.test.ts` içindeki `describe("decisionSchema", ...)` bloğuna ekle:

```typescript
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
```

Ve mevcut `test("decision reject without reason Türkçe", ...)` içindeki beklenen mesajı güncelle:

```typescript
  if (!r.success) expect(r.error.issues[0]?.message).toBe("Gerekçe gerekli");
```

- [ ] **Step 2: Testi koştur, başarısız olduğunu gör**

Run: `bun test src/domain/validation.test.ts`
Expected: FAIL — `start` değeri enum dışı (geçersiz), cancel reason kuralı yok, mesaj "Ret için gerekçe gerekli".

- [ ] **Step 3: validation.ts'i güncelle**

`src/domain/validation.ts`'te `decisionSchema` bloğunu (satır 25-34) şununla değiştir:

```typescript
export const DECISION_VALUES = ["accept", "reject", "start", "complete", "cancel"] as const;

export const decisionSchema = z
  .object({
    decision: z.enum(DECISION_VALUES, { message: "Geçersiz karar" }),
    reason: z.string().trim().max(2000, "Gerekçe en fazla 2000 karakter olabilir").optional(),
  })
  .refine((d) => !(d.decision === "reject" || d.decision === "cancel") || !!d.reason, {
    message: "Gerekçe gerekli",
    path: ["reason"],
  });
export type DecisionInput = z.infer<typeof decisionSchema>;
export type DecisionValue = (typeof DECISION_VALUES)[number];
```

- [ ] **Step 4: Testi koştur, geçtiğini gör**

Run: `bun test src/domain/validation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/validation.ts src/domain/validation.test.ts
git commit -m "feat(domain): decisionSchema accepts start/complete/cancel"
```

---

## Task 3: Dashboard istatistikleri (byStatus)

**Files:**
- Modify: `src/domain/stats.ts:47-49`
- Test: `src/domain/stats.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

`src/domain/stats.test.ts`'e ekle (dosyanın import'larını ve `buildDashboardStats` kullanımını mevcut testlerden taklit et; satır numarası test dosyasına göre değişebilir — yeni bir `test(...)` bloğu ekle):

```typescript
import { buildDashboardStats, type StatsRow } from "./stats";

test("new statuses are counted in byStatus and excluded from open", () => {
  const rows: StatsRow[] = [
    { id: 1, request_no: "T-1", title: "a", status: "in_progress", priority: "low",
      created_at: "2026-06-01T00:00:00.000Z", last_activity_at: "2026-06-01T00:00:00.000Z" },
    { id: 2, request_no: "T-2", title: "b", status: "done", priority: "low",
      created_at: "2026-06-01T00:00:00.000Z", last_activity_at: "2026-06-01T00:00:00.000Z" },
    { id: 3, request_no: "T-3", title: "c", status: "cancelled", priority: "low",
      created_at: "2026-06-01T00:00:00.000Z", last_activity_at: "2026-06-01T00:00:00.000Z" },
  ];
  const s = buildDashboardStats(rows, "2026-06-17T00:00:00.000Z");
  expect(s.byStatus.in_progress).toBe(1);
  expect(s.byStatus.done).toBe(1);
  expect(s.byStatus.cancelled).toBe(1);
  expect(s.open).toBe(0); // in_progress/done/cancelled are not new/clarifying/answered
  expect(s.agedCount).toBe(0); // done/cancelled terminal; in_progress aged but not terminal — check below
});
```

> Not: `in_progress` terminal değildir; yukarıdaki satırda 16 günlük hareketsizlik aged sayılır. Karışıklığı önlemek için `agedCount` satırını **silip** yerine yalnız `byStatus` ve `open` assertion'larını bırak (in_progress aged davranışı ayrı kapsam).

- [ ] **Step 2: Testi koştur, başarısız olduğunu gör**

Run: `bun test src/domain/stats.test.ts`
Expected: FAIL — `byStatus.in_progress` undefined (literal'de yok, `r.status in byStatus` false).

- [ ] **Step 3: stats.ts'i güncelle**

`src/domain/stats.ts` satır 47-49'daki `byStatus` literal'ini değiştir:

```typescript
  const byStatus: Record<RequestStatus, number> = {
    new: 0, clarifying: 0, answered: 0, accepted: 0,
    in_progress: 0, done: 0, rejected: 0, cancelled: 0,
  };
```

- [ ] **Step 4: Testi koştur, geçtiğini gör**

Run: `bun test src/domain/stats.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/stats.ts src/domain/stats.test.ts
git commit -m "feat(domain): count new statuses in dashboard stats"
```

---

## Task 4: Mail şablonu (done/cancelled)

**Files:**
- Modify: `src/mail/templates.ts:106-126`
- Test: `src/mail/templates.test.ts`

- [ ] **Step 1: Başarısız testleri yaz**

`src/mail/templates.test.ts`'e ekle (mevcut `decisionRequester` testlerinin yanına, `row()` ve `base` yardımcılarını kullan):

```typescript
  test("decisionRequester done: subject Türkçe", () => {
    const m = decisionRequester(row(), base, "done");
    expect(m.subject).toBe("Talep tamamlandı: TALEP-0007");
  });
  test("decisionRequester cancelled with reason: subject + escaped reason", () => {
    const m = decisionRequester(row(), base, "cancelled", "uygun <değil>");
    expect(m.subject).toBe("Talep iptal edildi: TALEP-0007");
    expect(m.html).toContain("uygun &lt;değil&gt;");
  });
```

- [ ] **Step 2: Testi koştur, başarısız olduğunu gör**

Run: `bun test src/mail/templates.test.ts`
Expected: FAIL — TS hatası: `"done"` argümanı `"accepted" | "rejected"` tipine atanamaz; çalışsa bile label yanlış.

- [ ] **Step 3: templates.ts'i güncelle**

`src/mail/templates.ts` `decisionRequester` fonksiyonunu (satır 106-126) şununla değiştir:

```typescript
export function decisionRequester(
  r: RequestRow,
  baseUrl: string,
  target: "accepted" | "rejected" | "done" | "cancelled",
  reason?: string,
): Mail {
  const url = `${baseUrl}/requests/${r.id}`;
  const LABEL = {
    accepted: "kabul edildi",
    rejected: "reddedildi",
    done: "tamamlandı",
    cancelled: "iptal edildi",
  } as const;
  const label = LABEL[target];
  const reasonHtml = reason ? `<p style="margin:0 0 16px;"><strong>Not:</strong> ${esc(reason)}</p>` : "";
  const reasonText = reason ? `\nNot: ${reason}` : "";
  return {
    subject: `Talep ${label}: ${r.request_no}`,
    html: emailLayout({
      heading: `Talep ${label}`,
      bodyHtml: `<p style="margin:0 0 16px;"><strong>${esc(r.request_no)}</strong> talebiniz ${label}.</p>` + reasonHtml,
      ctaText: "Talebi görüntüle",
      ctaUrl: url,
    }),
    text: `Talep ${label}: ${r.request_no}${reasonText}\nGörüntüle: ${url}`,
  };
}
```

- [ ] **Step 4: Testi koştur, geçtiğini gör**

Run: `bun test src/mail/templates.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/mail/templates.ts src/mail/templates.test.ts
git commit -m "feat(mail): decisionRequester supports done/cancelled"
```

---

## Task 5: Admin karar endpoint'i (start/complete/cancel)

**Files:**
- Modify: `src/server/routes/admin.ts:124-138`
- Test: `src/server/routes/admin.test.ts`

- [ ] **Step 1: Başarısız testleri yaz**

`src/server/routes/admin.test.ts`'te `describe("POST /api/admin/requests/:id/decision", ...)` bloğuna ekle. Bu dosyadaki mevcut yardımcılar: `seedRequest()` (talep tohumlar), `adminCookie()` (imzalı admin session), header deseni `{ cookie: adminCookie(), "x-csrf-token": "tok" }`, ve modül kapsamlı `sent` dizisi (gönderilen mailleri biriktirir). Talebi önce `accepted`'a `repo.addMessageAndTransition` ile getir:

```typescript
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
    const r = seedRequest(); // status 'new'
    const res = await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
      method: "POST", headers: adminHdr, body: decisionForm("start"),
    }));
    expect(res.status).toBe(409);
  });
```

> **Not:** `sent` push'u `subject`'i içerir; mail kontrolleri subject substring ile yapılır (kurulumdaki mock mailer `to`+`subject` biriktirir). `seedRequest()` talebi `a@kokilmetal.com.tr` için açar; admin `boss@kokilmetal.com.tr` olduğundan self-request yasağına takılmaz.

- [ ] **Step 2: Testi koştur, başarısız olduğunu gör**

Run: `bun test src/server/routes/admin.test.ts`
Expected: FAIL — `start` değeri `accepted`/`rejected` dışında olduğundan eski ternary `rejected` hedefler; 204 yerine yanlış geçiş / 409.

- [ ] **Step 3: admin.ts decision handler'ını güncelle**

`src/server/routes/admin.ts`'te decision handler gövdesinde, satır 124-136 arasını (target hesabı + transition + mail) şununla değiştir:

```typescript
    const DECISION_TARGET = {
      accept: "accepted",
      reject: "rejected",
      start: "in_progress",
      complete: "done",
      cancel: "cancelled",
    } as const;
    const target = DECISION_TARGET[parsed.data.decision];
    if (!canTransition(r.status, target)) {
      return json({ error: "Bu talep için geçersiz işlem" }, 409, extraHeaders);
    }
    deps.repo.addMessageAndTransition(
      r.id,
      parsed.data.reason ? { role: "admin", body: parsed.data.reason } : null,
      target,
      deps.now(),
    );
    // Best-effort mail to requester — in_progress is intentionally silent.
    if (target !== "in_progress") {
      const dMail = decisionRequester(r, deps.config.appBaseUrl, target, parsed.data.reason);
      deps.mailer.send(r.requester_email, dMail.subject, dMail.html, dMail.text).catch(() => {});
    }
```

(`parsed.data.decision` artık `DecisionValue` tipinde; `DECISION_TARGET` `as const` olduğundan `target` daraltılır ve `if (target !== "in_progress")` bloğunda `decisionRequester`'a güvenle geçer.)

- [ ] **Step 4: Testi koştur, geçtiğini gör**

Run: `bun test src/server/routes/admin.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/admin.ts src/server/routes/admin.test.ts
git commit -m "feat(server): /decision maps start/complete/cancel to status"
```

---

## Task 6: Tailwind renk token'ları

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: status renklerini ekle**

`tailwind.config.ts`'teki `status` nesnesini şununla değiştir:

```typescript
        status: {
          yeni: "#1976D2",
          netlestiriliyor: "#F57C00",
          kabul: "#2E7D32",
          ret: "#C62828",
          yapiliyor: "#5E35B1",
          tamam: "#00897B",
          iptal: "#607D8B",
        },
```

- [ ] **Step 2: Commit** (test yok; build doğrulaması Task 10'da)

```bash
git add tailwind.config.ts
git commit -m "feat(client): add status color tokens for new statuses"
```

---

## Task 7: StatusBadge tint + label

**Files:**
- Modify: `src/client/components/StatusBadge.tsx:4-10`
- Test: `src/client/components/StatusBadge.test.tsx`

- [ ] **Step 1: Başarısız testleri yaz**

`src/client/components/StatusBadge.test.tsx`'e ekle:

```typescript
test("StatusBadge renders in_progress label", () => {
  const html = renderToStaticMarkup(<StatusBadge status="in_progress" />);
  expect(html).toContain("Yapılıyor");
});
test("StatusBadge renders done label", () => {
  const html = renderToStaticMarkup(<StatusBadge status="done" />);
  expect(html).toContain("Tamamlandı");
});
test("StatusBadge renders cancelled label", () => {
  const html = renderToStaticMarkup(<StatusBadge status="cancelled" />);
  expect(html).toContain("İptal edildi");
});
```

- [ ] **Step 2: Testi koştur, başarısız olduğunu gör**

Run: `bun test src/client/components/StatusBadge.test.tsx`
Expected: FAIL — TS hatası: `TINT` `Record<RequestStatus, string>` 3 yeni anahtarı eksik.

- [ ] **Step 3: StatusBadge.tsx TINT'i güncelle**

`src/client/components/StatusBadge.tsx`'teki `TINT` haritasını değiştir:

```typescript
const TINT: Record<RequestStatus, string> = {
  new: "bg-status-yeni/10 text-status-yeni",
  clarifying: "bg-status-netlestiriliyor/10 text-status-netlestiriliyor",
  answered: "bg-status-netlestiriliyor/10 text-status-netlestiriliyor",
  accepted: "bg-status-kabul/10 text-status-kabul",
  in_progress: "bg-status-yapiliyor/10 text-status-yapiliyor",
  done: "bg-status-tamam/10 text-status-tamam",
  rejected: "bg-status-ret/10 text-status-ret",
  cancelled: "bg-status-iptal/10 text-status-iptal",
};
```

- [ ] **Step 4: Testi koştur, geçtiğini gör**

Run: `bun test src/client/components/StatusBadge.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/StatusBadge.tsx src/client/components/StatusBadge.test.tsx
git commit -m "feat(client): StatusBadge tint+label for new statuses"
```

---

## Task 8: Dashboard ve Admin durum listeleri

**Files:**
- Modify: `src/client/pages/Dashboard.tsx:13-20`
- Modify: `src/client/pages/Admin.tsx:22-29`

- [ ] **Step 1: Dashboard STATUS_ORDER + STATUS_BAR güncelle**

`src/client/pages/Dashboard.tsx` satır 13-20'yi değiştir:

```typescript
const STATUS_ORDER: RequestStatus[] = [
  "new", "clarifying", "answered", "accepted", "in_progress", "done", "rejected", "cancelled",
];
const STATUS_BAR: Record<RequestStatus, string> = {
  new: "bg-status-yeni",
  clarifying: "bg-status-netlestiriliyor",
  answered: "bg-status-netlestiriliyor",
  accepted: "bg-status-kabul",
  in_progress: "bg-status-yapiliyor",
  done: "bg-status-tamam",
  rejected: "bg-status-ret",
  cancelled: "bg-status-iptal",
};
```

- [ ] **Step 2: Admin STATUSES filtre listesini güncelle**

`src/client/pages/Admin.tsx` satır 22-29'u değiştir:

```typescript
// "Hepsi" (no filter) + all statuses.
const STATUSES: RequestStatus[] = [
  "new",
  "clarifying",
  "answered",
  "accepted",
  "in_progress",
  "done",
  "rejected",
  "cancelled",
];
```

- [ ] **Step 3: Tip kontrolü / test gate**

Run: `bun test`
Expected: PASS (bu dosyaların derlenmesi `Record<RequestStatus,...>` bütünlüğüyle doğrulanır; ayrı birim testi yok).

- [ ] **Step 4: Commit**

```bash
git add src/client/pages/Dashboard.tsx src/client/pages/Admin.tsx
git commit -m "feat(client): list new statuses in dashboard + admin filter"
```

---

## Task 9: AdminControls — duruma göre kontroller

**Files:**
- Modify: `src/client/components/AdminControls.tsx`
- Create: `src/client/components/AdminControls.test.tsx`

- [ ] **Step 1: Saf helper için başarısız test yaz**

`src/client/components/AdminControls.test.tsx` oluştur:

```typescript
import { expect, test } from "bun:test";
import { adminActionsFor } from "./AdminControls";

test("pre-decision statuses expose clarify/accept/reject", () => {
  for (const s of ["new", "clarifying", "answered"] as const) {
    expect(adminActionsFor(s)).toEqual(["clarify", "accept", "reject"]);
  }
});
test("accepted exposes start/complete/cancel", () => {
  expect(adminActionsFor("accepted")).toEqual(["start", "complete", "cancel"]);
});
test("in_progress exposes complete/cancel", () => {
  expect(adminActionsFor("in_progress")).toEqual(["complete", "cancel"]);
});
test("terminal statuses expose no actions", () => {
  for (const s of ["done", "rejected", "cancelled"] as const) {
    expect(adminActionsFor(s)).toEqual([]);
  }
});
```

- [ ] **Step 2: Testi koştur, başarısız olduğunu gör**

Run: `bun test src/client/components/AdminControls.test.tsx`
Expected: FAIL — `adminActionsFor` export edilmemiş.

- [ ] **Step 3: AdminControls.tsx — helper + ProgressForm + wrapper**

`src/client/components/AdminControls.tsx` başına, import'ların hemen ardından `adminActionsFor` helper'ını ekle:

```typescript
export type AdminAction = "clarify" | "accept" | "reject" | "start" | "complete" | "cancel";

export function adminActionsFor(status: RequestStatus): AdminAction[] {
  switch (status) {
    case "new":
    case "clarifying":
    case "answered":
      return ["clarify", "accept", "reject"];
    case "accepted":
      return ["start", "complete", "cancel"];
    case "in_progress":
      return ["complete", "cancel"];
    default:
      return [];
  }
}
```

`DecisionForm` içindeki `decide` imzasını beş değeri kabul edecek şekilde genişlet (yalnız tip değişir):

```typescript
  async function decide(
    decision: "accept" | "reject" | "start" | "complete" | "cancel",
    reason?: string,
  ) {
```

`DecisionForm` ve `ClarificationForm`'un altına, kabul-sonrası kontroller için yeni bir bileşen ekle:

```typescript
// ---- Post-acceptance progress (start / complete / cancel) ----

function ProgressForm({
  requestId,
  status,
  onDone,
}: {
  requestId: number;
  status: RequestStatus;
  onDone: () => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);

  async function send(decision: "start" | "complete" | "cancel", reason?: string) {
    setSubmitting(true);
    setErrorMsg(null);
    const fd = new FormData();
    fd.set("decision", decision);
    if (reason !== undefined) fd.set("reason", reason);
    try {
      await apiSend(`/api/admin/requests/${requestId}/decision`, "POST", fd);
      setCancelOpen(false);
      setCancelReason("");
      toast.show("Durum güncellendi.");
      onDone();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.");
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant mb-3">
        Durum
      </h3>

      {errorMsg && (
        <div
          role="alert"
          className="mb-4 bg-danger/10 border border-danger/30 text-danger rounded p-3 text-sm"
        >
          {errorMsg}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {status === "accepted" && (
          <Button type="button" variant="primary" size="md" disabled={submitting}
            onClick={() => send("start")}>
            Geliştirmeye başla
          </Button>
        )}

        <Button type="button" variant="success" size="md" disabled={submitting}
          onClick={() => send("complete")}>
          Tamamlandı
        </Button>

        <Dialog
          open={cancelOpen}
          onOpenChange={(open) => { setCancelOpen(open); if (open) setErrorMsg(null); }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="danger" size="md" disabled={submitting}>
              İptal et
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle className="text-base font-semibold text-on-surface mb-3">
              Talebi iptal et
            </DialogTitle>
            <label className="block text-sm font-medium text-on-surface mb-1">
              İptal gerekçesi
            </label>
            <div className="mb-4">
              <RichTextEditor value={cancelReason} onChange={setCancelReason} required maxLength={2000} />
            </div>
            {errorMsg && <p className="text-danger text-xs mb-2" role="alert">{errorMsg}</p>}
            <div className="flex justify-end gap-3">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="md" disabled={submitting}>
                  Vazgeç
                </Button>
              </DialogClose>
              <Button type="button" variant="danger" size="md" disabled={submitting}
                onClick={() => {
                  if (!cancelReason.trim()) { setErrorMsg("İptal gerekçesi gerekli"); return; }
                  send("cancel", cancelReason);
                }}>
                {submitting ? "Gönderiliyor…" : "İptal et"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}
```

`AdminControls` wrapper'ını duruma göre dallanacak şekilde değiştir:

```typescript
export function AdminControls({
  requestId,
  status,
  onDone,
}: {
  requestId: number;
  status: RequestStatus;
  onDone: () => void;
}) {
  const actions = adminActionsFor(status);

  if (actions.length === 0) {
    return (
      <div className="mt-6 border-t border-border-subtle pt-4 text-sm text-on-surface-variant">
        Bu talep kapalı.
      </div>
    );
  }

  if (actions.includes("clarify")) {
    return (
      <div className="mt-6 border-t border-border-subtle pt-6 flex flex-col gap-4">
        <ClarificationForm requestId={requestId} onDone={onDone} />
        <DecisionForm requestId={requestId} onDone={onDone} />
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-border-subtle pt-6 flex flex-col gap-4">
      <ProgressForm requestId={requestId} status={status} onDone={onDone} />
    </div>
  );
}
```

`isTerminal` import'u artık kullanılmıyorsa kaldır (satır 15'teki `import { isTerminal, type RequestStatus } ...` → `import { type RequestStatus } from "../../domain/status";`).

- [ ] **Step 4: Testi koştur, geçtiğini gör**

Run: `bun test src/client/components/AdminControls.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/AdminControls.tsx src/client/components/AdminControls.test.tsx
git commit -m "feat(client): admin controls for start/complete/cancel"
```

---

## Task 10: Tam gate + build + manuel doğrulama

**Files:** —

- [ ] **Step 1: Tüm testleri koştur**

Run: `bun test`
Expected: PASS (tüm paket yeşil).

- [ ] **Step 2: Build (TS + bundle + Tailwind)**

Run: `bun run build`
Expected: Hata yok; `public/` güncellenir, yeni `status-yapiliyor/tamam/iptal` sınıfları CSS'e dahil olur.

- [ ] **Step 3: Manuel akış doğrulaması**

Run: `bun run dev` → admin olarak bir talebi:
1. Kabul et → durum "Kabul edildi", **Geliştirmeye başla / Tamamlandı / İptal et** butonları görünür.
2. Geliştirmeye başla → "Yapılıyor"; **Tamamlandı / İptal et** kalır (mail gitmez).
3. Tamamlandı → "Tamamlandı", "Bu talep kapalı." (talep edene mail).
4. Ayrı bir kabul edilmiş talepte İptal et → gerekçe zorunlu, "İptal edildi" (mail).

Beklenen: rozet renkleri ayırt edilebilir; terminal durumlarda kontrol yok.

- [ ] **Step 4: build çıktısını commit'le**

```bash
git add public
git commit -m "chore(client): rebuild bundle for post-acceptance lifecycle"
```

---

## Self-Review Notları

- **Spec kapsamı:** 8 durum (Task 1), geçişler (Task 1), gerekçe zorunluluğu (Task 2), mail matrisi/in_progress sessiz (Task 4+5), tüm etkilenen dosyalar (Task 3,6,7,8,9) — kapsanıyor.
- **Tip tutarlılığı:** `DecisionValue`/`DECISION_VALUES` (Task 2) ↔ `DECISION_TARGET` (Task 5) ↔ `adminActionsFor`/`AdminAction` (Task 9) anahtarları birebir: accept/reject/start/complete/cancel.
- **Placeholder yok:** Tüm adımlar gerçek kod içeriyor. Task 5'te seed/header yardımcı adları dosyadan teyit edilerek kullanılmalı (uyarı eklendi).
