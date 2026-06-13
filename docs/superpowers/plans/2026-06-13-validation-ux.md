# Doğrulama UX'i (Türkçe, alan-bazı) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Doğrulama hatalarını Türkçe + alan-bazlı yapmak: zod mesajları Türkçe (sunucu), istemcide boş zorunlu alanlar gönderimden önce yakalanıp alanın altında Türkçe gösterilir.

**Architecture:** (A) `validation.ts` zod mesajları Türkçe; (B) route hata map'i ham `path:` önekini bırakır; (C) formlar submit'ten önce zorunlu alanları kontrol edip alan-bazlı Türkçe hata gösterir, boşsa POST etmez. Backend status davranışı değişmez.

**Tech Stack:** Zod 3.25, React 19 SPA, Bun.serve.

---

## File map
- DEĞİŞİR: `src/domain/validation.ts` (Türkçe mesaj) + `src/domain/validation.test.ts`
- DEĞİŞİR: `src/server/routes/requests.ts`, `src/server/routes/admin.ts` (error map: `i.message`)
- DEĞİŞİR: `src/client/pages/NewRequest.tsx` (alan-bazlı zorunlu kontrol)
- DEĞİŞİR: `src/client/components/ReplyForm.tsx`, `src/client/components/AdminControls.tsx` (zorunlu kontrol)

---

## Task 1: Türkçe zod mesajları + route map temizliği

**Files:** Modify `src/domain/validation.ts`, `src/domain/validation.test.ts`, `src/server/routes/requests.ts`, `src/server/routes/admin.ts`.

- [ ] **Step 1: Failing test — `src/domain/validation.test.ts`**
Add (Türkçe mesaj doğrulaması):
```ts
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
  if (!r.success) expect(r.error.issues.find((i)=>i.path[0]==="title")?.message).toBe("Başlık en fazla 200 karakter olabilir");
});
test("decision reject without reason Türkçe", () => {
  const r = decisionSchema.safeParse({ decision: "reject" });
  expect(r.success).toBe(false);
  if (!r.success) expect(r.error.issues[0]?.message).toBe("Ret için gerekçe gerekli");
});
```
(Match existing import style in the file.) Run `bun test src/domain/validation.test.ts` → FAIL (messages are English default).

- [ ] **Step 2: Implement Türkçe messages — `src/domain/validation.ts`**
Replace the schemas with Türkçe messages:
```ts
import { z } from "zod";

export const REQUEST_TYPES = ["feature", "bug", "task"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;

const req = (max: number, label: string) =>
  z.string().trim().min(1, `${label} gerekli`).max(max, `${label} en fazla ${max} karakter olabilir`);

export const newRequestSchema = z.object({
  department: req(120, "Departman"),
  application: req(120, "Uygulama"),
  module_area: z.string().trim().max(120, "Modül/alan en fazla 120 karakter olabilir").optional().default(""),
  request_type: z.enum(REQUEST_TYPES, { errorMap: () => ({ message: "Talep türü seçiniz" }) }),
  title: req(200, "Başlık"),
  description: req(5000, "Açıklama"),
  expected_benefit: req(2000, "Beklenen fayda"),
  priority: z.enum(PRIORITIES, { errorMap: () => ({ message: "Öncelik seçiniz" }) }),
});
export type NewRequestInput = z.infer<typeof newRequestSchema>;

export const replySchema = z.object({ body: req(5000, "Cevap") });
export const messageSchema = z.object({ body: req(5000, "Soru") });

export const decisionSchema = z
  .object({
    decision: z.enum(["accept", "reject"], { errorMap: () => ({ message: "Geçersiz karar" }) }),
    reason: z.string().trim().max(2000, "Gerekçe en fazla 2000 karakter olabilir").optional(),
  })
  .refine((d) => d.decision !== "reject" || !!d.reason, {
    message: "Ret için gerekçe gerekli",
    path: ["reason"],
  });
export type DecisionInput = z.infer<typeof decisionSchema>;
```
NOTE: zod 3.25 — verify the enum error API. If `z.enum(arr, { errorMap })` is rejected by types/runtime, use the supported form for 3.25 (`z.enum(arr, { message: "..." })` works in recent v3; if not, `z.enum(arr, { errorMap: () => ({ message }) })`). Run the test to confirm whichever compiles AND yields the Türkçe message. Keep `req()` helper for the min/max messages.
Run `bun test src/domain/validation.test.ts` → PASS.

- [ ] **Step 3: Route error maps — drop `path:` prefix (Türkçe-only)**
In `src/server/routes/requests.ts` (2 spots) and `src/server/routes/admin.ts` (2 spots), change:
```ts
const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
```
to:
```ts
const errors = parsed.error.issues.map((i) => i.message);
```

- [ ] **Step 4: Full suite + commit**
Run `bun test` → all green (existing route tests assert status codes, not message text; if any asserts on the old English/path string, update it to the Türkçe message). `bun run build` → succeeds.
```bash
git add src/domain/validation.ts src/domain/validation.test.ts src/server/routes/requests.ts src/server/routes/admin.ts
git commit -m "feat: Turkish zod validation messages; clean error list (no path prefix)"
```

---

## Task 2: NewRequest — alan-bazlı zorunlu kontrol

**Files:** Modify `src/client/pages/NewRequest.tsx`.

- [ ] **Step 1: Add field-error state + pre-submit validation**
Read the file. Add near the other state:
```tsx
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
```
In `handleSubmit`, AFTER building `fd` and `fd.set("department", dept)` / `fd.set("module_area", moduleName)`, and BEFORE `apiSend`, add a client validation that reads the fd values and the controlled `dept`:
```tsx
    const get = (k: string) => ((fd.get(k) as string) ?? "").trim();
    const errs: Record<string, string> = {};
    if (!dept) errs.department = "Departman seçiniz";
    if (!get("request_type")) errs.request_type = "Talep türü seçiniz";
    if (!get("priority")) errs.priority = "Öncelik seçiniz";
    if (!get("title")) errs.title = "Başlık gerekli";
    if (!get("description")) errs.description = "Açıklama gerekli";
    if (!get("expected_benefit")) errs.expected_benefit = "Beklenen fayda gerekli";
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) { setSubmitting(false); return; }
```
(Place `setSubmitting(true)` before this and ensure the early `return` resets it — set `setSubmitting(false)` in the guard as shown. Also clear `setFieldErrors({})` at the very start of handleSubmit alongside `setErrorMsg(null)`.)

- [ ] **Step 2: Render per-field errors**
Under each relevant field's input/select, add an error line. For each of department, request_type, priority, title, description, expected_benefit add (adapt to the field's wrapper):
```tsx
{fieldErrors.<field> && (
  <p className="text-danger text-xs mt-1" role="alert">{fieldErrors.<field>}</p>
)}
```
e.g. after the `<select name="request_type">` add `{fieldErrors.request_type && <p className="text-danger text-xs mt-1" role="alert">{fieldErrors.request_type}</p>}`. For department put it after the department select; for description/expected_benefit after the `<RichTextEditor .../>`. Also add `aria-invalid={!!fieldErrors.<field>}` on each native input/select where practical.

- [ ] **Step 3: Build gate + commit**
Run: `bun run build` → succeeds. `bun test` → green (no test imports this page).
```bash
git add src/client/pages/NewRequest.tsx
git commit -m "feat: client-side required-field validation with Turkish messages on new-request form"
```

---

## Task 3: ReplyForm + AdminControls — zorunlu kontrol

**Files:** Modify `src/client/components/ReplyForm.tsx`, `src/client/components/AdminControls.tsx`.

- [ ] **Step 1: ReplyForm body required**
In `src/client/components/ReplyForm.tsx` `handleSubmit`, after building `fd`, before `apiSend`:
```tsx
    const body = ((fd.get("body") as string) ?? "").trim();
    if (!body) { setErrorMsg("Cevap gerekli"); setSubmitting(false); return; }
```
(`setErrorMsg`/`setSubmitting` already exist in ReplyForm. Clear `setErrorMsg(null)` at start as it already does.)

- [ ] **Step 2: AdminControls message body required**
In `src/client/components/AdminControls.tsx` message-form `handleSubmit`, after building `fd`, before `apiSend`:
```tsx
    const body = ((fd.get("body") as string) ?? "").trim();
    if (!body) { setErrorMsg("Soru gerekli"); setSubmitting(false); return; }
```
(Use the message form's existing error/submitting state setters — read the file for exact names.)

- [ ] **Step 3: AdminControls reject reason required**
In the reject `decide("reject", rejectReason)` path / the dialog's reject confirm button handler, guard before calling decide:
```tsx
    if (!rejectReason.trim()) { setErrorMsg("Ret gerekçesi gerekli"); return; }
```
(Place where the reject confirm button's onClick currently calls `decide("reject", rejectReason)`. The Dialog stays open so the user can fix it. Use the existing `errorMsg` state shown in the Karar card, or a local message in the dialog — read the file and surface it where visible.)

- [ ] **Step 4: Build gate + commit**
Run: `bun run build` → succeeds. `bun test` → green.
```bash
git add src/client/components/ReplyForm.tsx src/client/components/AdminControls.tsx
git commit -m "feat: required-field validation (Turkish) on reply/admin-message/reject"
```

---

## Task 4: Final verification + visual

**Files:** (none)

- [ ] **Step 1: Full test + build**
Run: `bun test` → all green (incl. new validation tests). `bun run build` → succeeds.

- [ ] **Step 2: Visual smoke (seeded server + admin cookie)**
Start server (dev-tour.db, gorkem admin). Verify:
- NewRequest'te hiçbir şey doldurmadan "Talep Gönder" → **alan altlarında Türkçe** hatalar ("Departman seçiniz", "Talep türü seçiniz", "Öncelik seçiniz", "Başlık gerekli", "Açıklama gerekli", "Beklenen fayda gerekli"); **POST gitmez** (network'te /api/requests yok). İngilizce mesaj yok.
- Tümü dolu → başarı (talep oluşur). Sonra DB'den test talebini sil (dev-tour.db kirletme).
- ReplyForm/admin soru/ret boş → Türkçe uyarı, gönderim engellenir.
- (Defense) Sunucudan dönen bir hata olursa banner'da Türkçe (path öneki yok).

- [ ] **Step 3: finishing-a-development-branch**
Use `superpowers:finishing-a-development-branch`.

---

## Self-Review Notları
- **Spec kapsamı:** A→Task1 (zod), B→Task1 (route map), C→Task2 (NewRequest) + Task3 (reply/admin/reject). §4 test→Task1 + Task4. Tümü karşılanıyor.
- **TipTap boş kontrolü:** description/expected_benefit hidden input markdown değeri `fd.get` ile okunur, trim'lenir → boşsa hata (editör boşken "").
- **zod enum API:** Task1 Step2 sürüm-doğrulamalı (errorMap vs message).
- **Reset/return:** her guard `setSubmitting(false)` + erken return; `setFieldErrors({})`/`setErrorMsg(null)` submit başında.
- **Backend status davranışı değişmez** — yalnız mesaj metni Türkçeleşir; route testleri (status/CSRF/IDOR) etkilenmez; metin assert eden test varsa güncellenir.
