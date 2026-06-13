# Markalı Mail Şablonları — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Bildirim maillerini route'lardaki gömülü `<p>` HTML'lerinden markalı, inline-CSS, düz-metin fallback'li ortak şablonlara (`src/mail/templates.ts`) taşımak.

**Architecture:** `templates.ts` saf fonksiyonlar: `emailLayout` (markalı kapsayıcı) + 5 bildirim fonksiyonu, her biri `{subject, html, text}` döndürür. Mailer `text` parametresi alır. Route'lar şablonları çağırır. Backend mantığı/akışı değişmez.

**Tech Stack:** Bun, nodemailer, TypeScript. Saf birim test.

---

## File map
- YENİ: `src/mail/templates.ts`, `src/mail/templates.test.ts`
- DEĞİŞİR: `src/mail/mailer.ts` (+`text`), `src/mail/mailer.test.ts`, `src/server/routes/requests.ts`, `src/server/routes/admin.ts`

`RequestRow` tipi `src/db/repo.ts`'ten gelir (alanlar: `id`, `request_no`, `title`, `requester_email`, `status`, …).

---

## Task 1: templates.ts (emailLayout + 5 şablon) — TDD

**Files:** Create `src/mail/templates.ts`, `src/mail/templates.test.ts`.

- [ ] **Step 1: Başarısız test yaz** — `src/mail/templates.test.ts`
```ts
import { expect, test, describe } from "bun:test";
import {
  newRequestAdmin, newRequestRequester, replyAdmin, questionRequester, decisionRequester,
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

  test("XSS: title is HTML-escaped in html", () => {
    const m = newRequestAdmin(row({ title: '<script>alert(1)</script>' }), base);
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).not.toContain("<script>alert(1)</script>");
  });
});
```
Run: `bun test src/mail/templates.test.ts` → FAIL (module yok).

- [ ] **Step 2: Implement `src/mail/templates.ts`**
```ts
// src/mail/templates.ts — branded, inline-CSS notification email templates.
import type { RequestRow } from "../db/repo";

export interface Mail {
  subject: string;
  html: string;
  text: string;
}

const PRIMARY = "#0F4C81";

// Small local HTML-escape (kept here to avoid src/mail depending on src/server).
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailLayout(opts: {
  heading: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
}): string {
  const { heading, bodyHtml, ctaText, ctaUrl } = opts;
  const button =
    ctaText && ctaUrl
      ? `<tr><td style="padding:8px 0 4px;">
            <a href="${ctaUrl}" style="display:inline-block;background:${PRIMARY};color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:10px 20px;border-radius:4px;font-family:Arial,Helvetica,sans-serif;">${esc(ctaText)}</a>
          </td></tr>`
      : "";
  return `<!doctype html><html lang="tr"><body style="margin:0;padding:0;background:#f3f3f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f3f8;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
      <tr><td style="background:${PRIMARY};padding:16px 24px;">
        <span style="color:#ffffff;font-size:16px;font-weight:bold;">Talep Portalı</span>
      </td></tr>
      <tr><td style="padding:24px;">
        <h1 style="margin:0 0 12px;font-size:18px;color:#191c1f;">${esc(heading)}</h1>
        <div style="font-size:14px;line-height:22px;color:#42474f;">${bodyHtml}</div>
        <table role="presentation" cellpadding="0" cellspacing="0">${button}</table>
      </td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid #E2E8F0;">
        <span style="font-size:12px;color:#727780;">Bu e-posta Talep Portalı tarafından otomatik gönderildi.</span>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export function newRequestAdmin(r: RequestRow, baseUrl: string): Mail {
  const url = `${baseUrl}/admin/requests/${r.id}`;
  return {
    subject: `Yeni talep: ${r.request_no}`,
    html: emailLayout({
      heading: "Yeni talep",
      bodyHtml: `<p style="margin:0 0 16px;"><strong>${esc(r.request_no)}</strong> — ${esc(r.title)} adlı yeni bir talep oluşturuldu.</p>`,
      ctaText: "İncele",
      ctaUrl: url,
    }),
    text: `Yeni talep: ${r.request_no} — ${r.title}\nİncele: ${url}`,
  };
}

export function newRequestRequester(r: RequestRow, baseUrl: string): Mail {
  const url = `${baseUrl}/requests/${r.id}`;
  return {
    subject: `Talebiniz alındı: ${r.request_no}`,
    html: emailLayout({
      heading: "Talebiniz alındı",
      bodyHtml: `<p style="margin:0 0 16px;"><strong>${esc(r.request_no)}</strong> numaralı talebiniz alındı. Süreci aşağıdaki bağlantıdan takip edebilirsiniz.</p>`,
      ctaText: "Talebi görüntüle",
      ctaUrl: url,
    }),
    text: `Talebiniz alındı: ${r.request_no}\nTakip: ${url}`,
  };
}

export function replyAdmin(r: RequestRow, baseUrl: string): Mail {
  const url = `${baseUrl}/admin/requests/${r.id}`;
  return {
    subject: `Cevaplandı: ${r.request_no}`,
    html: emailLayout({
      heading: "Talep cevaplandı",
      bodyHtml: `<p style="margin:0 0 16px;"><strong>${esc(r.request_no)}</strong> talebine cevap verildi.</p>`,
      ctaText: "İncele",
      ctaUrl: url,
    }),
    text: `Cevaplandı: ${r.request_no}\nİncele: ${url}`,
  };
}

export function questionRequester(r: RequestRow, baseUrl: string): Mail {
  const url = `${baseUrl}/requests/${r.id}`;
  return {
    subject: `Talebiniz hakkında soru: ${r.request_no}`,
    html: emailLayout({
      heading: "Talebiniz hakkında soru var",
      bodyHtml: `<p style="margin:0 0 16px;"><strong>${esc(r.request_no)}</strong> talebinizle ilgili netleştirme soruları var. Lütfen cevaplayın.</p>`,
      ctaText: "Cevapla",
      ctaUrl: url,
    }),
    text: `Talebiniz hakkında soru: ${r.request_no}\nCevapla: ${url}`,
  };
}

export function decisionRequester(
  r: RequestRow,
  baseUrl: string,
  target: "accepted" | "rejected",
  reason?: string,
): Mail {
  const url = `${baseUrl}/requests/${r.id}`;
  const label = target === "accepted" ? "kabul edildi" : "reddedildi";
  const reasonHtml = reason
    ? `<p style="margin:0 0 16px;"><strong>Not:</strong> ${esc(reason)}</p>`
    : "";
  const reasonText = reason ? `\nNot: ${reason}` : "";
  return {
    subject: `Talep ${label}: ${r.request_no}`,
    html: emailLayout({
      heading: `Talep ${label}`,
      bodyHtml:
        `<p style="margin:0 0 16px;"><strong>${esc(r.request_no)}</strong> talebiniz ${label}.</p>` +
        reasonHtml,
      ctaText: "Talebi görüntüle",
      ctaUrl: url,
    }),
    text: `Talep ${label}: ${r.request_no}${reasonText}\nGörüntüle: ${url}`,
  };
}
```
Run: `bun test src/mail/templates.test.ts` → PASS (7 tests).

- [ ] **Step 3: Commit**
```bash
git add src/mail/templates.ts src/mail/templates.test.ts
git commit -m "feat: branded mail templates (5 notifications, html + text)"
```

---

## Task 2: Mailer `text` parametresi

**Files:** Modify `src/mail/mailer.ts`; Test `src/mail/mailer.test.ts`.

- [ ] **Step 1: Failing test (mailer.test.ts)**
Read `src/mail/mailer.test.ts` (it uses a mock transport recording `sendMail` calls). Add:
```ts
test("send passes text to transport when provided", async () => {
  const sent: any[] = [];
  const mailer = makeMailer({ async sendMail(m) { sent.push(m); } }, "From <f@k.com>");
  await mailer.send("to@x.com", "Konu", "<p>html</p>", "düz metin");
  expect(sent[0].text).toBe("düz metin");
  expect(sent[0].html).toBe("<p>html</p>");
});
test("send omits text when not provided", async () => {
  const sent: any[] = [];
  const mailer = makeMailer({ async sendMail(m) { sent.push(m); } }, "From <f@k.com>");
  await mailer.send("to@x.com", "Konu", "<p>html</p>");
  expect(sent[0].text).toBeUndefined();
});
```
(Match the file's existing import of `makeMailer` and its mock-transport style.)
Run: `bun test src/mail/mailer.test.ts` → the text test FAILS (text not forwarded).

- [ ] **Step 2: Implement**
In `src/mail/mailer.ts`:
- Extend `Transport.sendMail` message type with `text?: string`:
```ts
export type Transport = {
  sendMail(msg: { from: string; to: string; subject: string; html: string; text?: string }): Promise<unknown>;
};
```
- Extend `send`:
```ts
    async send(to: string, subject: string, html: string, text?: string): Promise<void> {
      try {
        await transport.sendMail({ from, to, subject, html, ...(text !== undefined ? { text } : {}) });
      } catch (err) {
        console.error(`[mail] gönderilemedi to=${to} subject=${subject}`, err);
      }
    },
```
Run: `bun test src/mail/mailer.test.ts` → PASS.

- [ ] **Step 3: Commit**
```bash
git add src/mail/mailer.ts src/mail/mailer.test.ts
git commit -m "feat: mailer forwards optional plain-text body"
```

---

## Task 3: Route'ları şablonlara bağla

**Files:** Modify `src/server/routes/requests.ts`, `src/server/routes/admin.ts`.

Read both files for the exact mail call sites + variable names. Replace the inline `mailer.send(addr, "subject literal", \`<p>...html...\`)` calls with template-driven calls. The `esc` import from `../escape` becomes unused in these route files IF no other usage remains — check and remove if unused.

- [ ] **Step 1: requests.ts — create (2 mails) + reply (1 mail)**
Add import: `import { newRequestAdmin, newRequestRequester, replyAdmin } from "../../mail/templates";`
In `POST /api/requests`, replace the admin-loop + requester mail block with:
```ts
    const adminMail = newRequestAdmin(r, deps.config.appBaseUrl);
    for (const admin of deps.config.adminEmails) {
      deps.mailer.send(admin, adminMail.subject, adminMail.html, adminMail.text).catch(() => {});
    }
    const reqMail = newRequestRequester(r, deps.config.appBaseUrl);
    deps.mailer.send(user.email, reqMail.subject, reqMail.html, reqMail.text).catch(() => {});
```
In `POST /api/requests/:id/reply`, replace the admin-loop mail with:
```ts
    const replyMail = replyAdmin(r, deps.config.appBaseUrl);
    for (const admin of deps.config.adminEmails) {
      deps.mailer.send(admin, replyMail.subject, replyMail.html, replyMail.text).catch(() => {});
    }
```
Remove the now-dead inline subject/html literals. If `esc` import is now unused in requests.ts, remove it.

- [ ] **Step 2: admin.ts — message (1 mail) + decision (1 mail)**
Add import: `import { questionRequester, decisionRequester } from "../../mail/templates";`
In `message` handler, replace the requester mail with:
```ts
    const qMail = questionRequester(r, deps.config.appBaseUrl);
    deps.mailer.send(r.requester_email, qMail.subject, qMail.html, qMail.text).catch(() => {});
```
In `decision` handler, replace the requester mail with:
```ts
    const dMail = decisionRequester(r, deps.config.appBaseUrl, target, parsed.data.reason);
    deps.mailer.send(r.requester_email, dMail.subject, dMail.html, dMail.text).catch(() => {});
```
(`target` is the existing `"accepted"|"rejected"` var; `parsed.data.reason` is the optional reason. Note the current decision mail used `await` — switch to best-effort `.catch(()=>{})` for consistency, OR keep `await` if the file uses await elsewhere; prefer `.catch` to match requests.ts. The decision body's old inline `esc(reason)` is now handled inside the template.) If `esc` import becomes unused in admin.ts, remove it.

- [ ] **Step 3: Build + tests**
Run: `bun run build` → succeeds. `bun test` → ALL green (route tests use a mock mailer that ignores the extra `text` arg; mail content isn't asserted by existing route tests, so they stay green). If any route test asserted an old subject/body string, update it to the new template's subject.

- [ ] **Step 4: Commit**
```bash
git add src/server/routes/requests.ts src/server/routes/admin.ts
git commit -m "feat: send branded mail templates from request/admin routes"
```

---

## Task 4: Final verification + preview

**Files:** (none — verification)

- [ ] **Step 1: Full test + build**
Run: `bun test` → all green. `bun run build` → succeeds. `grep -rn "esc" src/server/routes/` → confirm `esc` only imported where still used (no dangling unused import).

- [ ] **Step 2: Visual preview (optional but recommended)**
Generate the 5 emails' HTML to files and eyeball one in a browser:
```bash
bun -e 'import {newRequestAdmin,newRequestRequester,replyAdmin,questionRequester,decisionRequester} from "/home/kmadmin/talep-portal/src/mail/templates"; const r:any={id:7,request_no:"TALEP-0007",title:"Barkod <okuyucu> desteği",requester_email:"a@x.com",status:"new"}; const b="http://localhost:3000"; await Bun.write("/tmp/mail-preview.html", [newRequestAdmin(r,b),newRequestRequester(r,b),replyAdmin(r,b),questionRequester(r,b),decisionRequester(r,b,"rejected","uygun değil")].map(m=>m.html).join("<hr>")); console.log("wrote /tmp/mail-preview.html");'
```
Open `/tmp/mail-preview.html` (or screenshot via Playwright) to confirm branding/CTA render. Confirm the `<okuyucu>` in the title is escaped (no raw tag).

- [ ] **Step 3: finishing-a-development-branch**
Use `superpowers:finishing-a-development-branch`.

---

## Self-Review Notları
- **Spec kapsamı:** §3.1 emailLayout+esc→Task1; §3.2 beş şablon→Task1; §3.3 mailer text→Task2; §3.4 route entegrasyonu→Task3; §4 test→Task1/2 + Task4. Tümü karşılanıyor.
- **Geriye uyumluluk:** mailer `text` opsiyonel; eski 3-arg çağrı kalmaz (hepsi 4-arg'a çevrilir) ama opsiyonel olduğu için kırılma yok.
- **esc:** `templates.ts` kendi `esc`'ini barındırır (spec kararı). Route'lardaki `esc` importları artık kullanılmıyorsa kaldırılır (Task3).
- **Tip tutarlılığı:** `Mail` arayüzü `{subject,html,text}`; 5 fonksiyon aynı dönüş. `decisionRequester(r, base, target, reason?)` imzası route'ta `target`/`parsed.data.reason` ile eşleşir. `RequestRow` repo'dan.
- **Davranış:** subject artık şablondan; mail içerikleri zenginleşir ama akış/best-effort aynı. Backend mantığı değişmez → 192 test yeşil kalmalı (+ yeni template/mailer testleri).
