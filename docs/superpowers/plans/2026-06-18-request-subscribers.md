# Talep Takipçileri (Subscribers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Companion design: `docs/superpowers/specs/2026-06-18-request-subscribers-design.md`.

**Goal:** Bir talebe email ile takipçi (CC) ekleme/çıkarma. Takipçi edilen kişi talep detayını görür ve (yeni mesaj + karar) olaylarında mail alır. Davet/CC modeli: yalnız talep eden veya admin ekler; self-unsubscribe'a izinli.

**Architecture:** Yeni `subscribers` tablosu + repo metodları. `canViewRequest` 3. parametre (`isSubscriber`) alır — sıfır-I/O kuralı korunur, takipçi bilgisini route sağlar. Mail alıcıları `collectRecipients` yardımcısıyla dedup'lanır; takipçilere tarafsız şablonlar (`subscriberMessage`/`subscriberDecision`/`subscriberWelcome`) gönderilir, mevcut şablonlar değişmez.

**Tech Stack:** Bun + bun:sqlite, Zod, React 19 + Tailwind/shadcn, nodemailer. Testler `bun test` (in-memory SQLite + mock mailer `sent: {to, subject}[]`).

**Önemli tuzak:** Entegrasyon testleri `db.ts` migration'ını kullanmaz — her `*.test.ts` kendi `schema(db)` fonksiyonuyla tabloları elle yaratır. `subscribers` tablosunu **hem `src/db/db.ts` migration'ına hem de** `src/server/routes/{requests,admin,attachments,definitions}.test.ts` içindeki `schema()` fonksiyonlarına eklemek gerekir (Task 2).

**Bildirim matrisi (takipçilere):**

| Olay | Takipçiye mail | Talep edene (mevcut) | Adminlere (mevcut) |
|---|---|---|---|
| Yeni talep | ❌ | ✅ | ✅ |
| Admin soru (message) | ✅ tarafsız | ✅ `questionRequester` | ❌ |
| Talep eden cevap (reply) | ✅ tarafsız | ❌ | ✅ `replyAdmin` |
| Karar accept/reject/done/cancel | ✅ tarafsız | ✅ `decisionRequester` | ❌ |
| Karar start (in_progress) | ❌ | ❌ | ❌ |
| Takipçi eklendi | ✅ welcome (yalnız yeni) | — | — |

---

## File Structure

- **Create** `src/domain/hosted-domain.ts` — `isHostedDomain`.
- **Create** `src/domain/hosted-domain.test.ts`.
- **Modify** `src/domain/authz.ts` — `canViewRequest` 3. parametre, `canManageSubscribers`, `canRemoveSubscriber`.
- **Modify** `src/domain/authz.test.ts` — yeni fonksiyonlar.
- **Modify** `src/db/db.ts` — `subscribers` tablosu + indeksler.
- **Modify** `src/db/repo.ts` — `SubscriberRow` + 4 metod.
- **Modify** `src/db/repo.test.ts` — yeni metodlar.
- **Modify** `src/server/routes/{requests,admin,attachments,definitions}.test.ts` — her `schema()`'ya `subscribers` tablosu.
- **Create** `src/mail/recipients.ts` — `collectRecipients`.
- **Create** `src/mail/recipients.test.ts`.
- **Modify** `src/mail/templates.ts` — `detailUrl`, `subscriberMessage`, `subscriberDecision`, `subscriberWelcome`.
- **Modify** `src/mail/templates.test.ts` — yeni şablonlar.
- **Modify** `src/server/routes/requests.ts` — detay yanıtına `subscribers`/`isSubscriber`; `POST/DELETE /subscribers`; reply'de takipçi maili.
- **Modify** `src/server/routes/admin.ts` — message + decision'da takipçi maili.
- **Modify** `src/server/routes/attachments.ts` — `canViewRequest`'e `isSubscriber` geç.
- **Modify** `src/server/routes/requests.test.ts`, `admin.test.ts`, `attachments.test.ts` — yeni uçnokalar + takipçi mail testleri.
- **Modify** `src/client/hooks/useRequestDetail.ts` — `DetailData` + `subscribers`/`isSubscriber`.
- **Create** `src/client/components/Subscribers.tsx` — panel.
- **Modify** `src/client/pages/RequestDetailEmployee.tsx`, `RequestDetailAdmin.tsx` — panel.
- **Modify** `src/client/labels.ts` — UI metinleri.

---

## Task 1: Domain — hosted-domain + authz

**Files:**
- Create: `src/domain/hosted-domain.ts`
- Test: `src/domain/hosted-domain.test.ts`
- Modify: `src/domain/authz.ts`
- Test: `src/domain/authz.test.ts`

- [ ] **Step 1: Başarısız testleri yaz**

`src/domain/hosted-domain.test.ts` oluştur:

```typescript
import { expect, test } from "bun:test";
import { isHostedDomain } from "./hosted-domain";

test("matches hosted domain suffix (case-insensitive)", () => {
  expect(isHostedDomain("a@kokilmetal.com.tr", "kokilmetal.com.tr")).toBe(true);
  expect(isHostedDomain("A@KOKILMETAL.COM.TR", "kokilmetal.com.tr")).toBe(true);
});
test("rejects other domains and spoofed suffixes", () => {
  expect(isHostedDomain("a@gmail.com", "kokilmetal.com.tr")).toBe(false);
  expect(isHostedDomain("a@evilkokilmetal.com.tr", "kokilmetal.com.tr")).toBe(false);
  expect(isHostedDomain("kokilmetal.com.tr@evil.com", "kokilmetal.com.tr")).toBe(false);
});
test("trims whitespace", () => {
  expect(isHostedDomain("  a@kokilmetal.com.tr  ", "kokilmetal.com.tr")).toBe(true);
});
```

`src/domain/authz.test.ts`'e ekle (mevcut `canViewRequest`/`canReply` testlerine dokunma):

```typescript
import { canViewRequest, canManageSubscribers, canRemoveSubscriber, type User } from "./authz";

const admin: User = { email: "boss@kokilmetal.com.tr", name: "B", isAdmin: true };
const requester: User = { email: "a@kokilmetal.com.tr", name: "A", isAdmin: false };
const third: User = { email: "c@kokilmetal.com.tr", name: "C", isAdmin: false };
const req = { requester_email: "a@kokilmetal.com.tr", status: "clarifying" as const };

test("canViewRequest: subscriber flag grants access", () => {
  expect(canViewRequest(third, req, false)).toBe(false);
  expect(canViewRequest(third, req, true)).toBe(true);
  // default param backward-compat
  expect(canViewRequest(requester, req)).toBe(true);
});

test("canManageSubscribers: admin or requester only", () => {
  expect(canManageSubscribers(admin, req)).toBe(true);
  expect(canManageSubscribers(requester, req)).toBe(true);
  expect(canManageSubscribers(third, req)).toBe(false);
});

test("canRemoveSubscriber: self OR manager", () => {
  expect(canRemoveSubscriber(third, req, "c@kokilmetal.com.tr")).toBe(true); // self
  expect(canRemoveSubscriber(admin, req, "c@kokilmetal.com.tr")).toBe(true);
  expect(canRemoveSubscriber(requester, req, "c@kokilmetal.com.tr")).toBe(true);
  expect(canRemoveSubscriber(third, req, "d@kokilmetal.com.tr")).toBe(false); // neither
});
```

- [ ] **Step 2: Testi koştur, başarısız olduğunu gör**

Run: `bun test src/domain/hosted-domain.test.ts src/domain/authz.test.ts`
Expected: FAIL — `isHostedDomain` yok; yeni authz fonksiyonları yok.

- [ ] **Step 3: hosted-domain.ts oluştur**

```typescript
// src/domain/hosted-domain.ts
export function isHostedDomain(email: string, hostedDomain: string): boolean {
  const e = email.trim().toLowerCase();
  const d = hostedDomain.trim().toLowerCase();
  return e.endsWith("@" + d);
}
```

- [ ] **Step 4: authz.ts güncelle**

`src/domain/authz.ts`'i şu içerikle değiştir (mevcut `isAdmin`/`User`/`RequestRef` korunur, `canReply` aynı):

```typescript
// src/domain/authz.ts
import type { RequestStatus } from "./status";

export type User = { email: string; name: string; isAdmin: boolean };
export type RequestRef = {
  requester_email: string;
  status: RequestStatus;
};

export function isAdmin(email: string, adminEmails: string[]): boolean {
  const target = email.trim().toLowerCase();
  return adminEmails.some((a) => a.trim().toLowerCase() === target);
}

export function canViewRequest(
  user: User,
  req: RequestRef,
  isSubscriber: boolean = false,
): boolean {
  if (user.isAdmin) return true;
  if (user.email.toLowerCase() === req.requester_email.toLowerCase()) return true;
  return isSubscriber;
}

export function canReply(user: User, req: RequestRef): boolean {
  if (user.email.toLowerCase() !== req.requester_email.toLowerCase())
    return false;
  return req.status === "clarifying";
}

/** Who may add/remove subscribers on a request: the requester or an admin. */
export function canManageSubscribers(user: User, req: RequestRef): boolean {
  if (user.isAdmin) return true;
  return user.email.toLowerCase() === req.requester_email.toLowerCase();
}

/** Who may remove a specific subscriber: the subscriber themselves (self-unsubscribe),
 *  or a manager (admin/requester). */
export function canRemoveSubscriber(user: User, req: RequestRef, targetEmail: string): boolean {
  if (user.email.toLowerCase() === targetEmail.trim().toLowerCase()) return true;
  return canManageSubscribers(user, req);
}
```

- [ ] **Step 5: Testi koştur, geçtiğini gör**

Run: `bun test src/domain/hosted-domain.test.ts src/domain/authz.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/domain/hosted-domain.ts src/domain/hosted-domain.test.ts src/domain/authz.ts src/domain/authz.test.ts
git commit -m "feat(domain): hosted-domain check + subscriber authz helpers"
```

---

## Task 2: DB şema + Repo

**Files:**
- Modify: `src/db/db.ts`
- Modify: `src/db/repo.ts`
- Test: `src/db/repo.test.ts`
- Modify: `src/server/routes/{requests,admin,attachments,definitions}.test.ts` — `schema()`'lara tablo

- [ ] **Step 1: Başarısız testleri yaz**

`src/db/repo.test.ts`'e ekle (mevcut kurulumu kullan: `repo = makeRepo(schema(...))`. Eğer test dosyası `schema()` ile tabloları yaratıyorsa, önce aşağıdaki `subscribers` CREATE'i o `schema()`'ya da ekle — Task 2 Step 3'te yapılacak):

```typescript
import type { SubscriberRow } from "./repo";

describe("subscribers", () => {
  test("addSubscriber inserts and returns row; idempotent returns null", () => {
    const r = repo.createRequest(baseNewRequest(), "2026-01-01T00:00:00.000Z");
    const s1 = repo.addSubscriber(r.id, "c@kokilmetal.com.tr", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
    expect(s1?.email).toBe("c@kokilmetal.com.tr");
    expect(s1?.added_by_email).toBe("a@kokilmetal.com.tr");
    const s2 = repo.addSubscriber(r.id, "C@KOKILMETAL.COM.TR", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
    expect(s2).toBeNull(); // already subscribed (normalized match)
  });
  test("isSubscriber + listSubscribers", () => {
    const r = repo.createRequest(baseNewRequest(), "2026-01-01T00:00:00.000Z");
    repo.addSubscriber(r.id, "c@kokilmetal.com.tr", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
    expect(repo.isSubscriber(r.id, "C@kokilmetal.com.tr")).toBe(true);
    expect(repo.isSubscriber(r.id, "d@kokilmetal.com.tr")).toBe(false);
    const list = repo.listSubscribers(r.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.email).toBe("c@kokilmetal.com.tr");
  });
  test("removeSubscriber", () => {
    const r = repo.createRequest(baseNewRequest(), "2026-01-01T00:00:00.000Z");
    repo.addSubscriber(r.id, "c@kokilmetal.com.tr", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
    expect(repo.removeSubscriber(r.id, "c@kokilmetal.com.tr")).toBe(true);
    expect(repo.removeSubscriber(r.id, "c@kokilmetal.com.tr")).toBe(false); // gone
    expect(repo.isSubscriber(r.id, "c@kokilmetal.com.tr")).toBe(false);
  });
});
```

> `baseNewRequest()` adı repo.test.ts'teki mevcut yardımcıdır; yoksa `createRequest`'in beklediği `CreateRequestInput`'u elle inşa et (yukarıdaki örnek yardımcıyı mevcut teste göre uyarla).

- [ ] **Step 2: Testi koştur, başarısız olduğunu gör**

Run: `bun test src/db/repo.test.ts`
Expected: FAIL — `addSubscriber`/`isSubscriber`/`listSubscribers`/`removeSubscriber` yok; tablo yok.

- [ ] **Step 3: db.ts'e subscribers tablosu**

`src/db/db.ts` `migrate()`'indeki `applications` CREATE'inden sonra (kapanış backtick'ten önce) ekle:

```sql
    CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      added_by_email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(request_id, email)
    );
    CREATE INDEX IF NOT EXISTS idx_subscribers_request ON subscribers(request_id);
    CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
```

- [ ] **Step 4: Test schema()'larına tabloyu ekle**

`src/server/routes/{requests,admin,attachments,definitions}.test.ts`'teki her `schema(db)` fonksiyonuna, son `CREATE TABLE`'dan sonra ekle:

```typescript
    CREATE TABLE subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id),
      email TEXT NOT NULL,
      added_by_email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(request_id, email)
    );
    CREATE INDEX idx_subscribers_request ON subscribers(request_id);
```

> Test `schema()`'larında `ON DELETE CASCADE` gerekmez (talep silme testi yok); `PRAGMA foreign_keys=ON` requests.test.ts'te var. `applications` tablosu olmayan testlerde (`requests`/`attachments`) `subscribers` yine de eklenebilir (bağımsız tablo).

- [ ] **Step 5: repo.ts'e tipler + metodlar**

`src/db/repo.ts`'te, `Application` tipinden sonra ekle:

```typescript
export type SubscriberRow = {
  id: number;
  request_id: number;
  email: string;
  added_by_email: string;
  created_at: string;
};
```

`makeRepo` döndürülen nesneye (örn. `listApplications`'dan sonra, kapanıştan önce) ekle:

```typescript
    addSubscriber(
      requestId: number,
      email: string,
      addedByEmail: string,
      createdAt: string,
    ): SubscriberRow | null {
      const e = email.trim().toLowerCase();
      const by = addedByEmail.trim().toLowerCase();
      const existing = db
        .query<SubscriberRow, [number, string]>(
          "SELECT * FROM subscribers WHERE request_id = ? AND email = ?",
        )
        .get(requestId, e);
      if (existing) return null;
      return db
        .query<SubscriberRow, any>(
          `INSERT INTO subscribers (request_id, email, added_by_email, created_at)
           VALUES (?, ?, ?, ?) RETURNING *`,
        )
        .get(requestId, e, by, createdAt) as SubscriberRow;
    },
    removeSubscriber(requestId: number, email: string): boolean {
      const res = db
        .query("DELETE FROM subscribers WHERE request_id = ? AND email = ?")
        .run(requestId, email.trim().toLowerCase());
      return res.changes > 0;
    },
    isSubscriber(requestId: number, email: string): boolean {
      const row = db
        .query<{ id: number }, [number, string]>(
          "SELECT id FROM subscribers WHERE request_id = ? AND email = ?",
        )
        .get(requestId, email.trim().toLowerCase());
      return row != null;
    },
    listSubscribers(requestId: number): SubscriberRow[] {
      return db
        .query<SubscriberRow, [number]>(
          "SELECT * FROM subscribers WHERE request_id = ? ORDER BY id ASC",
        )
        .all(requestId);
    },
```

- [ ] **Step 6: Testi koştur, geçtiğini gör**

Run: `bun test src/db/repo.test.ts`
Expected: PASS

- [ ] **Step 7: Mevcut route testleri hâlâ yeşil mi (schema güncellemesi sonrası)?**

Run: `bun test src/server/routes/`
Expected: PASS (tablo eklendi, yeni uçnoka henüz yok → eski testler etkilenmez).

- [ ] **Step 8: Commit**

```bash
git add src/db/db.ts src/db/repo.ts src/db/repo.test.ts src/server/routes/requests.test.ts src/server/routes/admin.test.ts src/server/routes/attachments.test.ts src/server/routes/definitions.test.ts
git commit -m "feat(db): subscribers table + repo methods"
```

---

## Task 3: Mail — collectRecipients + takipçi şablonları

**Files:**
- Create: `src/mail/recipients.ts`
- Test: `src/mail/recipients.test.ts`
- Modify: `src/mail/templates.ts`
- Test: `src/mail/templates.test.ts`

- [ ] **Step 1: collectRecipients test + impl**

`src/mail/recipients.test.ts` oluştur:

```typescript
import { expect, test } from "bun:test";
import { collectRecipients } from "./recipients";

test("dedups + lowercases", () => {
  const r = collectRecipients({
    requesterEmail: "A@x.com",
    subscribers: ["a@x.com", "b@x.com"],
    includeRequester: true,
    includeSubscribers: true,
  });
  expect(r.sort()).toEqual(["a@x.com", "b@x.com"]);
});
test("exclude removes the actor", () => {
  const r = collectRecipients({
    requesterEmail: "a@x.com",
    subscribers: ["b@x.com"],
    includeRequester: true,
    includeSubscribers: true,
    excludeEmail: "a@x.com",
  });
  expect(r).toEqual(["b@x.com"]);
});
test("flags control inclusion", () => {
  expect(collectRecipients({ requesterEmail: "a@x.com", subscribers: ["b@x.com"] })).toEqual([]);
  expect(collectRecipients({ requesterEmail: "a@x.com", subscribers: [], includeRequester: true })).toEqual(["a@x.com"]);
});
```

`src/mail/recipients.ts` oluştur:

```typescript
export function collectRecipients(opts: {
  requesterEmail: string;
  subscribers: string[];
  includeRequester?: boolean;
  includeSubscribers?: boolean;
  excludeEmail?: string;
}): string[] {
  const set = new Set<string>();
  if (opts.includeRequester) set.add(opts.requesterEmail.trim().toLowerCase());
  if (opts.includeSubscribers) for (const s of opts.subscribers) set.add(s.trim().toLowerCase());
  if (opts.excludeEmail) set.delete(opts.excludeEmail.trim().toLowerCase());
  return [...set];
}
```

Run: `bun test src/mail/recipients.test.ts` → PASS.

- [ ] **Step 2: Templates testleri yaz**

`src/mail/templates.test.ts`'e ekle (mevcut `row()` + `base` yardımcılarını kullan; yoksa `row()`'u ekle: `{ id: 7, request_no: "TALEP-0007", title: "T", ... } as RequestRow`):

```typescript
import { subscriberMessage, subscriberDecision, subscriberWelcome } from "./templates";

test("subscriberMessage: subject + /requests/ url + byName", () => {
  const m = subscriberMessage(row(), base, "Ayşe", "admin");
  expect(m.subject).toBe("Güncelleme: TALEP-0007");
  expect(m.html).toContain("/requests/7");
  expect(m.html).toContain("Ayşe");
});
test("subscriberDecision: done label + reason escaped", () => {
  const m = subscriberDecision(row(), base, "done", "x <b>");
  expect(m.subject).toBe("Takip ettiğiniz talep tamamlandı: TALEP-0007");
  expect(m.html).toContain("tamamlandı");
  expect(m.html).toContain("x &lt;b&gt;");
});
test("subscriberWelcome: addedByName + url", () => {
  const m = subscriberWelcome(row(), base, "Mehmet");
  expect(m.subject).toBe("Takipçi olarak eklendiniz: TALEP-0007");
  expect(m.html).toContain("Mehmet");
  expect(m.html).toContain("/requests/7");
});
```

- [ ] **Step 3: Testi koştur, başarısız olduğunu gör**

Run: `bun test src/mail/templates.test.ts`
Expected: FAIL — fonksiyonlar yok.

- [ ] **Step 4: templates.ts'e yardımcı + 3 şablon**

`src/mail/templates.ts`'te, dosyanın sonuna (mevcut `decisionRequester`'dan sonra) ekle:

```typescript
function detailUrl(baseUrl: string, id: number, audience: "requester" | "admin" | "subscriber"): string {
  return audience === "admin"
    ? `${baseUrl}/admin/requests/${id}`
    : `${baseUrl}/requests/${id}`;
}

/** Neutral "a message was added" notice for subscribers. */
export function subscriberMessage(
  r: RequestRow,
  baseUrl: string,
  byName: string,
  authorRole: "admin" | "requester",
): Mail {
  const url = detailUrl(baseUrl, r.id, "subscriber");
  const roleTr = authorRole === "admin" ? "yönetici" : "talep sahibi";
  return {
    subject: `Güncelleme: ${r.request_no}`,
    html: emailLayout({
      heading: "Takip ettiğiniz talepte güncelleme var",
      bodyHtml: `<p style="margin:0 0 16px;"><strong>${esc(r.request_no)}</strong> — ${esc(r.title)} talebine ${esc(byName)} (${roleTr}) bir mesaj ekledi.</p>`,
      ctaText: "Talebi görüntüle",
      ctaUrl: url,
    }),
    text: `Güncelleme: ${r.request_no} — ${byName} (${roleTr}) mesaj ekledi.\nGörüntüle: ${url}`,
  };
}

/** Neutral decision notice for subscribers (in_progress is never sent). */
export function subscriberDecision(
  r: RequestRow,
  baseUrl: string,
  target: "accepted" | "rejected" | "done" | "cancelled",
  reason?: string,
): Mail {
  const url = detailUrl(baseUrl, r.id, "subscriber");
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
    subject: `Takip ettiğiniz talep ${label}: ${r.request_no}`,
    html: emailLayout({
      heading: `Takip ettiğiniz talep ${label}`,
      bodyHtml: `<p style="margin:0 0 16px;"><strong>${esc(r.request_no)}</strong> — ${esc(r.title)} talebi ${label}.</p>` + reasonHtml,
      ctaText: "Talebi görüntüle",
      ctaUrl: url,
    }),
    text: `Takip ettiğiniz talep ${label}: ${r.request_no}${reasonText}\nGörüntüle: ${url}`,
  };
}

/** Welcome notice to a freshly-added subscriber. */
export function subscriberWelcome(
  r: RequestRow,
  baseUrl: string,
  addedByName: string,
): Mail {
  const url = detailUrl(baseUrl, r.id, "subscriber");
  return {
    subject: `Takipçi olarak eklendiniz: ${r.request_no}`,
    html: emailLayout({
      heading: "Bir talebe takipçi olarak eklendiniz",
      bodyHtml: `<p style="margin:0 0 16px;">${esc(addedByName)} sizi <strong>${esc(r.request_no)}</strong> — ${esc(r.title)} talebine takipçi olarak ekledi. Bu talepte olan bitenden e-posta ile haberdar olacaksınız.</p>`,
      ctaText: "Talebi görüntüle",
      ctaUrl: url,
    }),
    text: `${addedByName} sizi ${r.request_no} talebine takipçi olarak ekledi.\nGörüntüle: ${url}`,
  };
}
```

- [ ] **Step 5: Testi koştur, geçtiğini gör**

Run: `bun test src/mail/templates.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/mail/recipients.ts src/mail/recipients.test.ts src/mail/templates.ts src/mail/templates.test.ts
git commit -m "feat(mail): collectRecipients + subscriber notification templates"
```

---

## Task 4: Detay endpoint'i + attachments görünürlüğü

**Files:**
- Modify: `src/server/routes/requests.ts` — `GET /api/requests/:id` yanıtına `subscribers`/`isSubscriber`
- Modify: `src/server/routes/attachments.ts` — `canViewRequest`'e `isSubscriber` geç
- Test: `src/server/routes/requests.test.ts`, `src/server/routes/attachments.test.ts`

- [ ] **Step 1: Başarısız testleri yaz**

`src/server/routes/requests.test.ts`'te mevcut `GET /api/requests/:id` testleri yakınına ekle (`seedRequest`/`authedCookie` yardımcılarını kullan; subscriber eklemek için `repo.addSubscriber`):

```typescript
describe("GET /api/requests/:id — subscribers in detail", () => {
  test("detail includes subscribers list + isSubscriber flag", async () => {
    const r = seedRequest(); // requester a@kokilmetal.com.tr
    repo.addSubscriber(r.id, "c@kokilmetal.com.tr", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
    const res = await handler(new Request(`http://x/api/requests/${r.id}`, {
      headers: { cookie: authedCookie("c@kokilmetal.com.tr", "C") },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isSubscriber).toBe(true);
    expect(body.subscribers.map((s: any) => s.email)).toContain("c@kokilmetal.com.tr");
  });
  test("non-subscriber third party gets 404 (no leak)", async () => {
    const r = seedRequest();
    repo.addSubscriber(r.id, "c@kokilmetal.com.tr", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
    const res = await handler(new Request(`http://x/api/requests/${r.id}`, {
      headers: { cookie: authedCookie("d@kokilmetal.com.tr", "D") },
    }));
    expect(res.status).toBe(404);
  });
});
```

`src/server/routes/attachments.test.ts`'e ekle (mevcut kurulumu taklit et: seed bir request + attachment, sonra subscriber ekleyip GET):

```typescript
test("subscriber can download attachment", async () => {
  // seed request by a@kokilmetal.com.tr, attachment attached, add subscriber c@
  // ... (use existing helper to seed attachment; then:)
  repo.addSubscriber(reqId, "c@kokilmetal.com.tr", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
  const res = await handler(new Request(`http://x/requests/${reqId}/attachments/${attId}`, {
    headers: { cookie: subCookie("c@kokilmetal.com.tr") },
  }));
  expect(res.status).toBe(200);
});
```

> `subCookie` = `authedCookie`'un bu dosyadaki karşılığı; mevcut yardımcı adını kullan.

- [ ] **Step 2: Testi koştur, başarısız olduğunu gör**

Run: `bun test src/server/routes/requests.test.ts src/server/routes/attachments.test.ts`
Expected: FAIL — detail'de `subscribers`/`isSubscriber` yok; attachment subscriber'a 404.

- [ ] **Step 3: requests.ts detay handler'ını güncelle**

`src/server/routes/requests.ts`'teki `GET /api/requests/:id` bloğunu, `canViewRequest` çağrısını subscriber bilgilendirerek ve yanıtı genişleterek değiştir:

```typescript
  const detailMatch = path.match(/^\/api\/requests\/(\d+)$/);
  if (detailMatch && method === "GET") {
    const id = Number(detailMatch[1]);
    if (!Number.isInteger(id)) return json({ error: "not found" }, 404, extraHeaders);
    const r = deps.repo.getRequest(id);
    if (!r) return json({ error: "not found" }, 404, extraHeaders);
    const isSub = deps.repo.isSubscriber(r.id, user.email);
    if (!canViewRequest(user, r, isSub)) return json({ error: "not found" }, 404, extraHeaders);
    return json(
      {
        request: r,
        messages: deps.repo.listMessages(r.id),
        attachments: deps.repo.listAttachmentsByRequest(r.id),
        subscribers: deps.repo.listSubscribers(r.id),
        isSubscriber: isSub,
      },
      200,
      extraHeaders,
    );
  }
```

- [ ] **Step 4: attachments.ts güncelle**

`src/server/routes/attachments.ts`'te `canViewRequest(user, r)` satırını:

```typescript
  const isSub = repo.isSubscriber(att.request_id, user.email);
  if (!r || !canViewRequest(user, r, isSub)) return text("Bulunamadı", 404);
```

- [ ] **Step 5: Testi koştur, geçtiğini gör**

Run: `bun test src/server/routes/requests.test.ts src/server/routes/attachments.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/requests.ts src/server/routes/attachments.ts src/server/routes/requests.test.ts src/server/routes/attachments.test.ts
git commit -m "feat(server): subscribers in request detail + attachment visibility"
```

---

## Task 5: Subscribers CRUD uçnokaları

**Files:**
- Modify: `src/server/routes/requests.ts` — `POST/DELETE /api/requests/:id/subscribers`
- Test: `src/server/routes/requests.test.ts`

- [ ] **Step 1: Başarısız testleri yaz**

`src/server/routes/requests.test.ts`'e ekle:

```typescript
describe("POST /api/requests/:id/subscribers", () => {
  const addHdr = (email = "a@kokilmetal.com.tr") => ({
    cookie: authedCookie(email), "x-csrf-token": "tok",
  });
  function addForm(email: string) {
    const fd = new FormData(); fd.set("email", email); return fd;
  }

  test("requester adds subscriber → 201 + welcome mail to subscriber", async () => {
    const r = seedRequest();
    sent = [];
    const res = await handler(new Request(`http://x/api/requests/${r.id}/subscribers`, {
      method: "POST", headers: addHdr(), body: addForm("c@kokilmetal.com.tr"),
    }));
    expect(res.status).toBe(201);
    expect(repo.isSubscriber(r.id, "c@kokilmetal.com.tr")).toBe(true);
    expect(sent.some((m) => m.to === "c@kokilmetal.com.tr" && m.subject.includes("Takipçi"))).toBe(true);
  });
  test("idempotent: re-add same → 200, no duplicate welcome", async () => {
    const r = seedRequest();
    repo.addSubscriber(r.id, "c@kokilmetal.com.tr", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
    sent = [];
    const res = await handler(new Request(`http://x/api/requests/${r.id}/subscribers`, {
      method: "POST", headers: addHdr(), body: addForm("c@kokilmetal.com.tr"),
    }));
    expect(res.status).toBe(200);
    expect(sent).toEqual([]);
  });
  test("non-hosted-domain email → 400", async () => {
    const r = seedRequest();
    const res = await handler(new Request(`http://x/api/requests/${r.id}/subscribers`, {
      method: "POST", headers: addHdr(), body: addForm("c@gmail.com"),
    }));
    expect(res.status).toBe(400);
  });
  test("adding requester's own email → 400", async () => {
    const r = seedRequest();
    const res = await handler(new Request(`http://x/api/requests/${r.id}/subscribers`, {
      method: "POST", headers: addHdr(), body: addForm("a@kokilmetal.com.tr"),
    }));
    expect(res.status).toBe(400);
  });
  test("third party (not requester/admin) → 403", async () => {
    const r = seedRequest();
    const res = await handler(new Request(`http://x/api/requests/${r.id}/subscribers`, {
      method: "POST", headers: addHdr("d@kokilmetal.com.tr"), body: addForm("e@kokilmetal.com.tr"),
    }));
    expect(res.status).toBe(403);
  });
  test("non-existent request → 404", async () => {
    const res = await handler(new Request(`http://x/api/requests/9999/subscribers`, {
      method: "POST", headers: addHdr(), body: addForm("c@kokilmetal.com.tr"),
    }));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/requests/:id/subscribers", () => {
  const hdr = (email = "a@kokilmetal.com.tr") => ({
    cookie: authedCookie(email), "x-csrf-token": "tok",
  });
  function delForm(email: string) {
    const fd = new FormData(); fd.set("email", email); return fd;
  }

  test("self-unsubscribe → 204", async () => {
    const r = seedRequest();
    repo.addSubscriber(r.id, "c@kokilmetal.com.tr", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
    const res = await handler(new Request(`http://x/api/requests/${r.id}/subscribers`, {
      method: "DELETE", headers: hdr("c@kokilmetal.com.tr"), body: delForm("c@kokilmetal.com.tr"),
    }));
    expect(res.status).toBe(204);
    expect(repo.isSubscriber(r.id, "c@kokilmetal.com.tr")).toBe(false);
  });
  test("requester removes a subscriber → 204", async () => {
    const r = seedRequest();
    repo.addSubscriber(r.id, "c@kokilmetal.com.tr", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
    const res = await handler(new Request(`http://x/api/requests/${r.id}/subscribers`, {
      method: "DELETE", headers: hdr(), body: delForm("c@kokilmetal.com.tr"),
    }));
    expect(res.status).toBe(204);
  });
  test("third party removing someone else → 403", async () => {
    const r = seedRequest();
    repo.addSubscriber(r.id, "c@kokilmetal.com.tr", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
    const res = await handler(new Request(`http://x/api/requests/${r.id}/subscribers`, {
      method: "DELETE", headers: hdr("d@kokilmetal.com.tr"), body: delForm("c@kokilmetal.com.tr"),
    }));
    expect(res.status).toBe(403);
  });
  test("remove non-existent subscriber → 404", async () => {
    const r = seedRequest();
    const res = await handler(new Request(`http://x/api/requests/${r.id}/subscribers`, {
      method: "DELETE", headers: hdr(), body: delForm("z@kokilmetal.com.tr"),
    }));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Testi koştur, başarısız olduğunu gör**

Run: `bun test src/server/routes/requests.test.ts`
Expected: FAIL — uçnokalar yok.

- [ ] **Step 3: requests.ts'e uçnokaları ekle**

`src/server/routes/requests.ts`'in import'larına ekle:

```typescript
import { canViewRequest, canReply, canManageSubscribers, canRemoveSubscriber } from "../../domain/authz";
import { isHostedDomain } from "../../domain/hosted-domain";
import { subscriberWelcome } from "../../mail/templates";
```

`handleRequests`'in içinde, `replyMatch` bloğundan **önce** (veya `detailMatch`'ten sonra) iki yeni blok ekle:

```typescript
  // POST /api/requests/:id/subscribers — add a subscriber (CC)
  const subAddMatch = path.match(/^\/api\/requests\/(\d+)\/subscribers$/);
  if (subAddMatch && method === "POST") {
    const id = Number(subAddMatch[1]);
    if (!Number.isInteger(id)) return json({ error: "not found" }, 404, extraHeaders);
    const r = deps.repo.getRequest(id);
    if (!r) return json({ error: "not found" }, 404, extraHeaders);
    if (!canManageSubscribers(user, r)) return json({ error: "Yetkisiz" }, 403, extraHeaders);
    const form = await parseForm(req);
    const email = String(form.email ?? "").trim();
    if (!email) return json({ errors: ["E-posta gerekli"] }, 400, extraHeaders);
    if (!isHostedDomain(email, deps.config.googleHostedDomain))
      return json({ errors: ["Yalnızca kurumsal hesaplar eklenebilir"] }, 400, extraHeaders);
    if (email.toLowerCase() === r.requester_email.toLowerCase())
      return json({ errors: ["Talep sahibi zaten bildirim alıyor"] }, 400, extraHeaders);
    const added = deps.repo.addSubscriber(r.id, email, user.email, deps.now());
    if (added) {
      const mail = subscriberWelcome(r, deps.config.appBaseUrl, user.name);
      deps.mailer.send(added.email, mail.subject, mail.html, mail.text).catch(() => {});
      return json({ ok: true }, 201, extraHeaders);
    }
    return json({ ok: true }, 200, extraHeaders); // idempotent
  }

  // DELETE /api/requests/:id/subscribers — remove (self-unsubscribe or manager)
  if (subAddMatch && method === "DELETE") {
    const id = Number(subAddMatch[1]);
    if (!Number.isInteger(id)) return json({ error: "not found" }, 404, extraHeaders);
    const r = deps.repo.getRequest(id);
    if (!r) return json({ error: "not found" }, 404, extraHeaders);
    const form = await parseForm(req);
    const email = String(form.email ?? "").trim();
    if (!email) return json({ errors: ["E-posta gerekli"] }, 400, extraHeaders);
    if (!canRemoveSubscriber(user, r, email)) return json({ error: "Yetkisiz" }, 403, extraHeaders);
    const removed = deps.repo.removeSubscriber(r.id, email);
    if (!removed) return json({ error: "not found" }, 404, extraHeaders);
    return new Response(null, { status: 204, headers: new Headers({ ...extraHeaders }) });
  }
```

> `subAddMatch` regex'i hem POST hem DELETE için tekrar kullanılır — ikinci blokta yeniden tanımlamaya gerek yok (yukarıdaki `const subAddMatch` hala kapsam içinde). Posta `added.email` normalize edilmiş halidir (repo küçük-harf kaydeder).

- [ ] **Step 4: Testi koştur, geçtiğini gör**

Run: `bun test src/server/routes/requests.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/requests.ts src/server/routes/requests.test.ts
git commit -m "feat(server): add/remove subscribers endpoints"
```

---

## Task 6: Mesaj/karar handler'larında takipçi maili

**Files:**
- Modify: `src/server/routes/requests.ts` — reply'de takipçi maili
- Modify: `src/server/routes/admin.ts` — message + decision'da takipçi maili
- Test: `src/server/routes/requests.test.ts`, `src/server/routes/admin.test.ts`

- [ ] **Step 1: Başarısız testleri yaz**

`src/server/routes/requests.test.ts`'e ekle (reply akışı — talep eden cevapladığında takipçiye mail):

```typescript
test("reply notifies subscribers (neutral template)", async () => {
  const r = seedRequest(); // status new → need clarifying
  repo.addMessageAndTransition(r.id, { role: "admin", body: "soru?" }, "clarifying", "2026-01-01T00:00:00.000Z");
  repo.addSubscriber(r.id, "c@kokilmetal.com.tr", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
  sent = [];
  const fd = new FormData(); fd.set("body", "cevap");
  const res = await handler(new Request(`http://x/api/requests/${r.id}/reply`, {
    method: "POST", headers: { cookie: authedCookie(), "x-csrf-token": "tok" }, body: fd,
  }));
  expect(res.status).toBe(204);
  // admins still get replyAdmin; subscriber gets neutral message
  expect(sent.some((m) => m.to === "c@kokilmetal.com.tr" && m.subject === "Güncelleme: " + r.request_no)).toBe(true);
});
```

`src/server/routes/admin.test.ts`'e ekle (admin soru + karar):

```typescript
test("admin question notifies subscribers", async () => {
  const r = seedRequest();
  repo.addSubscriber(r.id, "c@kokilmetal.com.tr", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
  sent = [];
  const fd = new FormData(); fd.set("body", "soru?");
  await handler(new Request(`http://x/api/admin/requests/${r.id}/message`, {
    method: "POST", headers: { cookie: adminCookie(), "x-csrf-token": "tok" }, body: fd,
  }));
  expect(sent.some((m) => m.to === "c@kokilmetal.com.tr")).toBe(true);
  // requester still gets questionRequester
  expect(sent.some((m) => m.to === r.requester_email)).toBe(true);
});

test("decision accept notifies subscribers; start (in_progress) does NOT", async () => {
  // accept
  let r = seedRequest();
  repo.addSubscriber(r.id, "c@kokilmetal.com.tr", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
  sent = [];
  const fdAccept = new FormData(); fdAccept.set("decision", "accept");
  await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
    method: "POST", headers: { cookie: adminCookie(), "x-csrf-token": "tok" }, body: fdAccept,
  }));
  expect(sent.some((m) => m.to === "c@kokilmetal.com.tr" && m.subject.includes("kabul edildi"))).toBe(true);

  // start → in_progress: subscriber NOT notified
  r = seedRequest();
  repo.addMessageAndTransition(r.id, null, "accepted", "2026-01-01T00:00:00.000Z");
  repo.addSubscriber(r.id, "c@kokilmetal.com.tr", "a@kokilmetal.com.tr", "2026-01-02T00:00:00.000Z");
  sent = [];
  const fdStart = new FormData(); fdStart.set("decision", "start");
  await handler(new Request(`http://x/api/admin/requests/${r.id}/decision`, {
    method: "POST", headers: { cookie: adminCookie(), "x-csrf-token": "tok" }, body: fdStart,
  }));
  expect(sent.some((m) => m.to === "c@kokilmetal.com.tr")).toBe(false);
});
```

- [ ] **Step 2: Testi koştur, başarısız olduğunu gör**

Run: `bun test src/server/routes/requests.test.ts src/server/routes/admin.test.ts`
Expected: FAIL — takipçiye mail gitmiyor.

- [ ] **Step 3: requests.ts reply handler'ına takipçi maili**

`src/server/routes/requests.ts`'teki `POST /api/requests/:id/reply` bloğunda, mevcut `replyAdmin` mail döngüsünden **sonra** ekle:

```typescript
    // Subscribers get a neutral "message added" notice (requester is the actor → excluded).
    const subs = deps.repo.listSubscribers(r.id).map((s) => s.email);
    const recipients = collectRecipients({
      requesterEmail: r.requester_email,
      subscribers: subs,
      includeSubscribers: true,
      excludeEmail: user.email,
    });
    const subMail = subscriberMessage(r, deps.config.appBaseUrl, user.name, "requester");
    for (const rcpt of recipients) {
      deps.mailer.send(rcpt, subMail.subject, subMail.html, subMail.text).catch(() => {});
    }
```

Ve import satırlarına ekle:

```typescript
import { collectRecipients } from "../../mail/recipients";
import { subscriberMessage } from "../../mail/templates";  // (subscriberWelcome zaten Task 5'te import edildi; varsa atla)
```

- [ ] **Step 4: admin.ts message + decision handler'larına takipçi maili**

`src/server/routes/admin.ts` import'larına ekle:

```typescript
import { collectRecipients } from "../../mail/recipients";
import { subscriberMessage, subscriberDecision } from "../../mail/templates";
```

Message handler'ında (`POST /api/admin/requests/:id/message`), mevcut `questionRequester` mail'inden **sonra** ekle:

```typescript
    // Subscribers get a neutral notice (admin is the actor → excluded).
    const subs = deps.repo.listSubscribers(r.id).map((s) => s.email);
    const recipients = collectRecipients({
      requesterEmail: r.requester_email,
      subscribers: subs,
      includeSubscribers: true,
      excludeEmail: user.email,
    });
    const subMail = subscriberMessage(r, deps.config.appBaseUrl, user.name, "admin");
    for (const rcpt of recipients) {
      deps.mailer.send(rcpt, subMail.subject, subMail.html, subMail.text).catch(() => {});
    }
```

Decision handler'ında (`POST /api/admin/requests/:id/decision`), mevcut `decisionRequester` bloğunu (`if (target !== "in_progress")`) genişlet:

```typescript
    if (target !== "in_progress") {
      const dMail = decisionRequester(r, deps.config.appBaseUrl, target, parsed.data.reason);
      deps.mailer.send(r.requester_email, dMail.subject, dMail.html, dMail.text).catch(() => {});
      // Subscribers get a neutral decision notice (admin is the actor → excluded).
      const subs = deps.repo.listSubscribers(r.id).map((s) => s.email);
      const recipients = collectRecipients({
        requesterEmail: r.requester_email,
        subscribers: subs,
        includeSubscribers: true,
        excludeEmail: user.email,
      });
      const subMail = subscriberDecision(r, deps.config.appBaseUrl, target, parsed.data.reason);
      for (const rcpt of recipients) {
        deps.mailer.send(rcpt, subMail.subject, subMail.html, subMail.text).catch(() => {});
      }
    }
```

- [ ] **Step 5: Testi koştur, geçtiğini gör**

Run: `bun test src/server/routes/requests.test.ts src/server/routes/admin.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/requests.ts src/server/routes/admin.ts src/server/routes/requests.test.ts src/server/routes/admin.test.ts
git commit -m "feat(server): notify subscribers on message + decision events"
```

---

## Task 7: İstemci — panel + tip + sayfa entegrasyonu

**Files:**
- Modify: `src/client/hooks/useRequestDetail.ts` — `DetailData`
- Create: `src/client/components/Subscribers.tsx`
- Modify: `src/client/pages/RequestDetailEmployee.tsx`
- Modify: `src/client/pages/RequestDetailAdmin.tsx`
- Modify: `src/client/labels.ts`

- [ ] **Step 1: DetailData tipini genişlet**

`src/client/hooks/useRequestDetail.ts`'teki `DetailData`'ya `subscribers` + `isSubscriber` ekle:

```typescript
import type { SubscriberRow } from "../../db/repo"; // veya yerel tip

export type DetailData = {
  request: RequestRow;
  messages: MessageRow[];
  attachments: AttachmentRow[];
  subscribers: SubscriberRow[];
  isSubscriber: boolean;
};
```

> Tip `SubscriberRow`'u `src/db/repo.ts`'ten import etmek istemci bundle'a SQL tipi çekmez (yalnız tip, erased). Alternatif: yerel minimal tip `{ id: number; email: string; added_by_email: string; created_at: string }` tanımla — tercih budur (katman temizliği). Bunu kullan:

```typescript
export type SubscriberView = {
  id: number;
  email: string;
  added_by_email: string;
  created_at: string;
};
export type DetailData = {
  request: RequestRow;
  messages: MessageRow[];
  attachments: AttachmentRow[];
  subscribers: SubscriberView[];
  isSubscriber: boolean;
};
```

- [ ] **Step 2: Subscribers paneli oluştur**

`src/client/components/Subscribers.tsx`:

```tsx
import { useState } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { apiSend } from "../api";
import { useToast } from "./Toast";

export function Subscribers({
  requestId,
  subscribers,
  isSubscriber,
  canManage,
  currentEmail,
  onChanged,
}: {
  requestId: number;
  subscribers: { id: number; email: string }[];
  isSubscriber: boolean;
  canManage: boolean;        // admin or requester
  currentEmail: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("email", email.trim());
    setSubmitting(true);
    try {
      const res = await fetch(`/api/requests/${requestId}/subscribers`, {
        method: "POST",
        headers: { "x-csrf-token": getCsrf() },
        body: fd,
      });
      if (res.status === 400) {
        const b = await res.json();
        setError(b.errors?.[0] ?? "Geçersiz e-posta");
        return;
      }
      if (!res.ok) throw new Error("Eklenemedi");
      setEmail("");
      toast.show("Takipçi eklendi.");
      onChanged();
    } catch {
      setError("Beklenmeyen bir hata oluştu.");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(targetEmail: string) {
    const fd = new FormData();
    fd.set("email", targetEmail);
    try {
      const res = await fetch(`/api/requests/${requestId}/subscribers`, {
        method: "DELETE",
        headers: { "x-csrf-token": getCsrf() },
        body: fd,
      });
      if (!res.ok) throw new Error();
      toast.show("Takipçı kaldırıldı.");
      onChanged();
    } catch {
      toast.show("Kaldırılamadı.");
    }
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant mb-3">
        Takipçiler ({subscribers.length})
      </h3>
      {subscribers.length === 0 && (
        <p className="text-sm text-on-surface-variant mb-3">Henüz takipçi yok.</p>
      )}
      <ul className="mb-3 space-y-1">
        {subscribers.map((s) => (
          <li key={s.id} className="flex items-center justify-between text-sm">
            <span className="text-on-surface">{s.email}</span>
            {(canManage || s.email.toLowerCase() === currentEmail.toLowerCase()) && (
              <button
                type="button"
                className="text-xs text-danger hover:underline"
                onClick={() => remove(s.email)}
              >Kaldır</button>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <form onSubmit={add} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="kurumsal e-posta"
            className="flex-1 rounded border border-border px-3 py-1.5 text-sm"
            required
          />
          <Button type="submit" variant="primary" size="sm" disabled={submitting}>Ekle</Button>
        </form>
      )}
      {error && <p role="alert" className="text-danger text-xs mt-2">{error}</p>}
      {isSubscriber && !canManage && (
        <Button type="button" variant="secondary" size="sm" className="mt-2"
          onClick={() => remove(currentEmail)}>Takipten çık</Button>
      )}
    </Card>
  );
}
```

> `getCsrf()` — `api.ts`'te CSRF token'ı cookie'den okuyan mevcut yardımcı; adını mevcut dosyadan teyit et (`apiSend` zaten header'ı basar; burada `fetch` doğrudan kullanıldığı için manuel gerekir — `apiSend`'i `DELETE` için de kullanabilirsin, o header'ı kendisi ekler). **Tercih:** `apiSend("/api/.../subscribers", "DELETE", fd)` kullan → CSRF header manuel gerekmez. `add` için de `apiSend` kullan.

- [ ] **Step 3: Sayfalara entegre et**

`src/client/pages/RequestDetailEmployee.tsx` ve `RequestDetailAdmin.tsx`'te, detay verisi geldikten sonra paneli render et. Her ikisinde de `data.subscribers`, `data.isSubscriber`, `user` (auth context) mevcuttur:

```tsx
<Subscribers
  requestId={request.id}
  subscribers={data.subscribers}
  isSubscriber={data.isSubscriber}
  canManage={user.isAdmin || user.email === request.requester_email}
  currentEmail={user.email}
  onChanged={reload}
/>
```

`reload` = `useRequestDetail`'in yeniden-fetch eden fonksiyonu (mevcut adını kullan).

- [ ] **Step 4: labels.ts'e metinler** (opsiyonel; yukarıdaki hardcoded TR metinler yeterliyse atla)

- [ ] **Step 5: Build**

Run: `bun run build`
Expected: Hata yok.

- [ ] **Step 6: Commit**

```bash
git add src/client/hooks/useRequestDetail.ts src/client/components/Subscribers.tsx src/client/pages/RequestDetailEmployee.tsx src/client/pages/RequestDetailAdmin.tsx
git commit -m "feat(client): subscribers panel on request detail pages"
```

---

## Task 8: Tam gate + build + manuel doğrulama

**Files:** —

- [ ] **Step 1: Tüm testler**

Run: `bun test`
Expected: PASS.

- [ ] **Step 2: Tip + build**

Run: `bun run build`
Expected: Hata yok.

- [ ] **Step 3: Manuel akış**

Run: `bun run dev`:
1. `a@` olarak talep aç → `/requests/:id`'de takipçi ekle `c@` → `c@`'ye "Takipçı olarak eklendiğiniz" maili.
2. `c@` olarak `/requests/:id` aç → talep detayı görünür (görme izni), listede kendisi.
3. Admin `boss@` soru sor → `a@`'ye soru maili + `c@`'ye "Güncelleme" maili.
4. `a@` cevapla → adminlere `replyAdmin` + `c@`'ye "Güncelleme".
5. Admin kabul et → `a@`'ye `decisionRequester` + `c@`'ye "takip ettiğiniz talep kabul edildi".
6. Admin "Geliştirmeye başla" (in_progress) → **kimsere** mail.
7. `c@` self-unsubscribe "Takipten çık" → listeden düşer.
8. `d@` (3. kişi) `/requests/:id`'i açmaya çalış → 404.

- [ ] **Step 4: Build çıktısını commit**

```bash
git add public
git commit -m "chore(client): rebuild bundle for subscribers feature"
```

---

## Self-Review Notları

- **Spec karşılığı:** Davet/CC modeli (Task 5 yetkileri), görünürlük (Task 4), bildirim matrisi (Task 6 + Task 3 şablonları), domain doğrulama (Task 5 `isHostedDomain`), idempotent ekleme (Task 2 + Task 5), self-unsubscribe (Task 5 `canRemoveSubscriber`) — kapsanıyor.
- **Test schema tuzağı:** `subscribers` tablosu 4 test dosyasının `schema()`'sına eklenmeli (Task 2 Step 4) — atlanırsa `no such table` hatası.
- **Tip akışı:** `SubscriberRow` (repo) → `SubscriberView` (client tip, erased) → UI. İstemci SQL tiplerini import etmez.
- **CSRF:** tüm mutating uçnokalar `/api/*` altında → mevcut handler CSRF + size kontrolünü uygular; `apiSend` header'ı basar.
- **Yerel yardımcı adları** (`seedRequest`, `authedCookie`, `adminCookie`, `baseNewRequest`, `row`, `base`, `reload`, `getCsrf`) her dosyada teyit edilmeli — plan ilgili Task'ta uyarı koydu.
- **Geriye dönük uyum:** `canViewRequest` 3. parametresi default `false` → mevcut 2-arg çağrılar (varsa) çalışır; ama Task 4'te iki çağrı güncellendi. `decisionRequester` imzası değişmedi.
