# Bun.serve Fullstack SPA Migrasyonu — Tasarım

- **Tarih:** 2026-06-12
- **Durum:** Onay bekliyor
- **Kaynak tasarım:** Stitch projesi `9132225055990929415` ("Industrial Utility System").
- **Önceki yön:** SSR (Hono + react-dom/server) — bırakıldı (superseded).

## 1. Amaç ve Karar Kaydı

Portalı **client-side React SPA**'ya taşımak; backend'i Hono'dan **Bun'ın native
fullstack `Bun.serve`** sistemine geçirmek (HTML entrypoint + otomatik client bundle +
JSON API route'ları). Stitch tasarımını shadcn/ui ile uygulamak.

| Karar | Seçim |
|---|---|
| Render modeli | Client-side React SPA |
| Sunucu | **Bun.serve fullstack** (Hono atılır) |
| Bundling | Bun native (HTML import → React + Tailwind otomatik) |
| Auth | httpOnly session cookie + **CSRF header** (double-submit) |
| UI | React 19 + shadcn/ui + Tailwind + Stitch token'ları |

## 2. Neyin Korunduğu / Neyin Yeniden Yazıldığı

**Korunur (framework-bağımsız saf mantık + testleri):**
- `src/domain/*` — status FSM, authz, validation, request-no, attachments. **Dokunulmaz.**
- `src/auth/session.ts` (HMAC sign/verify), `src/auth/google.ts` (OAuth url/exchange/verifyDomain). **Dokunulmaz.**
- `src/db/*`, `src/mail/*`, `src/storage/*`, `src/config.ts`. **Dokunulmaz.**
- `src/routes/uploads.ts` (multipart→storage mantığı; `File` tabanlı, framework-bağımsız). **Korunur.**
- Tasks 1-2 çıktısı: `src/components/ui/*` (Button/Card/Badge), `StatusBadge`, `tailwind.config.ts`, `src/styles/app.css`, `src/lib/cn.ts`, @radix dep. **Korunur.**

**Yeniden yazılır (HTTP plumbing):**
- `src/app.ts` (Hono fabrikası + middleware) → `src/server.ts` (Bun.serve fabrikası + auth/CSRF guard helper'ları).
- `src/routes/auth.ts`, `src/routes/public.ts`, `src/routes/admin.ts` → Bun.serve `Request→Response` handler'ları, **JSON** döner.
- `src/index.ts` → `Bun.serve({...})` başlatır.

**Atılır:**
- `src/render.tsx` (SSR helper) — SPA'da gerek yok.
- `hono` bağımlılığı.
- `src/views/views.tsx` string/SSR view'leri — yerine client React sayfaları.

## 3. Mimari

### 3.1 Sunucu (`Bun.serve`)
```
Bun.serve({
  port,
  routes: {
    "/api/...": JSON handler'lar (auth+CSRF guard'lı),
    "/auth/google", "/auth/google/callback", "/logout": redirect handler'lar,
    "/requests/:id/attachments/:attId": binary handler (nosniff + CSP sandbox),
    "/*": index.html (SPA shell — Bun client bundle'ı otomatik enjekte eder),
  },
})
```
- **DI korunur:** `makeServer(deps)` — `Deps` (config, repo, mailer, storage, now) dışarıdan enjekte; testte mock geçer (mevcut `buildApp(deps)` deseninin Bun.serve karşılığı). `makeServer` bir `{ fetch }` objesi döndürür ki testler `app.fetch(new Request(...))` ile çağırabilsin (Bun.serve'i gerçekten dinlemeden).

### 3.2 Auth/CSRF (load-bearing — birebir korunur)
- **Auth gate:** `/auth/*` ve SPA shell + statik bundle dışındaki tüm `/api/*` geçerli session ister. GET API → 401 JSON; mutating → 401.
- **Session:** httpOnly cookie, HMAC + expiry (mevcut `verifySession`, `SESSION_MAX_AGE=8s`). Cookie parse/serialize için küçük bir `src/http/cookies.ts` util (Hono'nun cookie helper'larının yerine).
- **CSRF (double-submit):** httpOnly olmayan `csrf` cookie + mutating fetch'lerde `X-CSRF-Token` header; constant-time compare. (Eski form `_csrf` yerine header — SPA fetch için doğru model.) **`/logout` muaf** kalır.
- **Upload cap:** `Content-Length > MAX_UPLOAD_BYTES` → 413.
- **Hosted-domain:** OAuth callback `verifyDomain` (hd + email) — değişmez.

### 3.3 Client SPA
- `index.html` → `src/client/main.tsx` (React root). Tailwind `src/styles/app.css` import edilir (Bun bundler derler).
- **Routing:** hafif (ör. `react-router-dom` veya minimal hash/path router — plan aşamasında netleşir; küçük tutulur).
- **Veri katmanı:** `src/client/api.ts` — `fetch` sarmalayıcı; GET'ler JSON okur, mutating'ler `X-CSRF-Token` header ekler (csrf cookie'den okunur), 401'de `/auth/google`'a yönlendirir.
- **Ekranlar:** Login (redirect tetikler), Yeni Talep, Taleplerim, Talep Detayı+Yazışma, Admin Paneli — hepsi shadcn + Stitch.

## 4. API Sözleşmesi (taslak — backend planında kesinleşir)

| Method | Path | Auth | Döner |
|---|---|---|---|
| GET | `/api/me` | session | `{ email, name, isAdmin }` |
| POST | `/api/requests` | session + CSRF | `{ id }` (multipart: alanlar + files) |
| GET | `/api/my` | session | `RequestRow[]` (kendi) |
| GET | `/api/requests/:id` | session + sahip/admin | `{ request, messages, attachments }` |
| POST | `/api/requests/:id/reply` | session + CSRF + canReply | `204` (multipart) |
| GET | `/api/admin/requests?status=` | session + admin | `RequestRow[]` |
| POST | `/api/admin/requests/:id/message` | admin + CSRF | `204` (multipart) |
| POST | `/api/admin/requests/:id/decision` | admin + CSRF | `204` (`decision=accept\|reject`, `reason`) |
| GET | `/requests/:id/attachments/:attId` | sahip/admin | binary (nosniff, CSP sandbox) |

Bulunamayan/yetkisiz kaynak → **404 JSON** (varlık sızdırma yok). FSM illegal geçiş → 409.

## 5. Test Stratejisi (CLAUDE.md gate korunur)

- **Korunan modül testleri** (domain/auth/db/mail/storage/uploads) **aynen yeşil kalmalı** — bunlar framework'e dokunmuyor.
- **HTTP testleri yeniden yazılır:** mevcut `routes/*.test.ts` HTML assert ediyordu → artık `app.fetch(new Request(...))` ile **JSON/status/cookie/header** assert eder. **Her güvenlik testi port edilir:**
  - CSRF eksik/yanlış header → 403 (eski `_csrf` testinin karşılığı).
  - Multipart upload CSRF'siz reddedilir (mevcut son commit'teki test).
  - IDOR: başkasının talebi → 404.
  - Attachment: `nosniff`, `Content-Security-Policy: sandbox`, non-allowlisted → `attachment` disposition.
  - Auth gate: session'sız mutating → 401.
- **Client testleri:** `api.ts` (CSRF header ekleme, 401 redirect) birim testi; ekran bileşenleri için hafif render testleri. Ağır E2E opsiyonel (Playwright mevcut).

## 6. Decomposition (alt-projeler)

Tek spec'e sığmayacak kadar büyük; iki alt-projeye bölünür, **sırayla**:

1. **Alt-proje A — Backend: Bun.serve JSON API** (bu planın ilk hedefi). Hono → Bun.serve; tüm route'lar JSON; auth/CSRF/güvenlik testleri port edilir. Bitince: çalışan, test edilen, SPA'nın tüketeceği API.
2. **Alt-proje B — Frontend: Client SPA**. `index.html` + React sayfaları + client routing + `api.ts` + shadcn ekranlar (Stitch). A'nın API sözleşmesini tüketir.

Her alt-proje kendi spec→plan→implement döngüsünü alır. Bu doküman ikisinin de kapsayıcı tasarımıdır; A ve B için ayrı plan dosyaları yazılır.

## 7. CLAUDE.md Güncellemesi (B'nin sonunda)
- §1: "Hono" → "Bun.serve fullstack"; "sunucu-tarafı render HTML (Tailwind CDN)" → "client-side React SPA + Bun bundler"; "Frontend build adımı yok" → "Bun fullstack bundle".
- §4 güvenlik: "CSRF tüm POST'larda `_csrf` token (form)" → "CSRF double-submit: cookie ↔ `X-CSRF-Token` header".
- §2 katman tablosu: `src/routes/` Hono adapter → Bun.serve handler; `src/views/` → `src/client/`; `src/http/` (cookie/guard util) eklenir.

## 8. Riskler
- **Güvenlik plumbing'i yeniden yazımı** — en büyük risk. Azaltma: her güvenlik testini önce port et (TDD), yeşil olmadan ilerleme.
- **Bun.serve `routes` + path param + HTML import sürüm desteği** — plan ilk adımında Bun sürümü doğrulanır; gerekiyorsa `fetch` handler + manuel routing fallback.
- **CSRF modeli değişimi (form→header)** — double-submit doğru kurulmalı; csrf cookie httpOnly **olmamalı** ki client okuyup header'a koyabilsin (httpOnly session'dan ayrı tutulur).
- **SPA auth UX** — 401'de redirect; OAuth dönüşünde SPA'ya `/my`.

## 9. Kapsam Dışı (YAGNI)
- SSR/SEO — yok (iç araç).
- Token/JWT auth — yok; cookie+CSRF header.
- Yeni özellik — yok; davranış eşdeğer migrasyon.
- Faz D işleri (GitHub issue, dashboard, AI) — dışı.
