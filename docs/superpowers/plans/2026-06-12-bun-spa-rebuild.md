# Bun.serve + SPA Temiz Yeniden Kurulum — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Portalın HTTP katmanını ve UI'sını sıfırdan temiz kurmak: Bun.serve fullstack + client React SPA (shadcn + Stitch). Test edilmiş çekirdek (`domain/auth/db/mail/storage/config`) korunur.

**Architecture:** `src/index.ts` → `Bun.serve({ routes, fetch: makeHandler(deps) })`. `makeHandler` saf `(Request)→Response` router; auth/CSRF guard'larından geçer, JSON döner. Client SPA `index.html`→`main.tsx`, `api.ts` ile fetch (CSRF header + 401 redirect). Çekirdek mantık reused.

**Tech Stack:** Bun 1.3 (serve+bundler), React 19, shadcn/ui, Tailwind 3, Zod. Hono YOK.

---

## Korunan / Atılan

**Korunur (dokunma):** `src/domain/*`, `src/auth/session.ts`, `src/auth/google.ts`, `src/db/*`, `src/mail/*`, `src/storage/*`, `src/config.ts`, `src/routes/uploads.ts` (File-tabanlı upload mantığı → `src/server/uploads.ts`'e taşınır), `src/components/ui/*`, `src/views/components/StatusBadge.tsx` (→ `src/client/components/`), `src/lib/cn.ts`, `tailwind.config.ts`, `src/styles/app.css`, ve TÜM korunan modüllerin `*.test.ts`'leri.

**Atılır:** `src/app.ts` (Hono), `src/routes/{auth,public,admin}.ts` + testleri, `src/views/views.tsx`, `src/render.tsx` + `src/render.test.tsx`, `hono` bağımlılığı.

## Güvenlik Davranışları (port edilir, her biri test edilir)
1. Auth gate: `/api/*` session ister; yoksa 401. `/auth/*` ve SPA/statik serbest.
2. Session: httpOnly cookie, `verifySession` + `SESSION_MAX_AGE` (8s) + constant-time.
3. CSRF double-submit: non-httpOnly `csrf` cookie ↔ mutating isteklerde `X-CSRF-Token` header; eşleşmezse 403. `/logout` muaf.
4. Upload cap: `Content-Length > MAX_UPLOAD_BYTES` (110MB) → 413.
5. Hosted-domain: OAuth callback `verifyDomain` (hd + email).
6. IDOR: başkasının/yok talep → 404 (sızdırma yok).
7. Attachment serve: `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'`, allowlist dışı → `attachment` disposition.
8. FSM illegal geçiş → 409 (route ön-kontrol) + repo throw.

## API Sözleşmesi
| Method | Path | Auth | Body | Döner |
|---|---|---|---|---|
| GET | `/api/me` | session | — | `{email,name,isAdmin}` |
| GET | `/api/my` | session | — | `RequestRow[]` |
| POST | `/api/requests` | session+CSRF | multipart | `201 {id}` |
| GET | `/api/requests/:id` | sahip/admin | — | `{request,messages,attachments}` |
| POST | `/api/requests/:id/reply` | canReply+CSRF | multipart(body,files) | `204` |
| GET | `/api/admin/requests?status=` | admin | — | `RequestRow[]` |
| POST | `/api/admin/requests/:id/message` | admin+CSRF | multipart(body,files) | `204` |
| POST | `/api/admin/requests/:id/decision` | admin+CSRF | json/form(decision,reason) | `204` |
| GET | `/auth/google` · `/auth/google/callback` · POST `/logout` | — | — | redirect + Set-Cookie |
| GET | `/requests/:id/attachments/:attId` | sahip/admin | — | binary |

Validation hatası → 400 `{errors:[]}`. Yetkisiz kaynak → 404. FSM → 409.

---

# ALT-PROJE A — Backend (Bun.serve JSON API)

## Task A1: HTTP temel — cookies + guards + handler skeleton + /api/me
**Files:** Create `src/server/cookies.ts` (+test), `src/server/guards.ts` (+test), `src/server/handler.ts` (+test), `src/server/context.ts`. Keep Hono running in parallel (don't delete yet) so existing tests stay green.

- [ ] **Step 1 (test-first): cookies util** — `src/server/cookies.test.ts`: `parseCookies("a=1; b=2")` → `{a:"1",b:"2"}`; `serializeCookie("session","x",{httpOnly:true,maxAge:60,path:"/",sameSite:"Lax"})` → string contains `session=x`, `HttpOnly`, `Max-Age=60`, `SameSite=Lax`, `Path=/`. Run → FAIL.
- [ ] **Step 2:** implement `src/server/cookies.ts`:
```ts
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export type CookieOpts = {
  httpOnly?: boolean; maxAge?: number; path?: string;
  sameSite?: "Lax" | "Strict" | "None"; secure?: boolean;
};
export function serializeCookie(name: string, value: string, o: CookieOpts = {}): string {
  let s = `${name}=${encodeURIComponent(value)}`;
  s += `; Path=${o.path ?? "/"}`;
  if (o.maxAge != null) s += `; Max-Age=${o.maxAge}`;
  if (o.sameSite) s += `; SameSite=${o.sameSite}`;
  if (o.httpOnly) s += `; HttpOnly`;
  if (o.secure) s += `; Secure`;
  return s;
}
export function expireCookie(name: string, path = "/"): string {
  return `${name}=; Path=${path}; Max-Age=0`;
}
```
Run test → PASS.
- [ ] **Step 3 (test-first): guards** — pure helpers operating on a parsed request context. `src/server/guards.test.ts`: given a context with valid session cookie → `getSessionUser` returns user; invalid/absent → null. `checkCsrf(ctx)` true when header `X-CSRF-Token` equals csrf cookie, false otherwise. `timingSafeEqualStr` constant-time. Run → FAIL.
- [ ] **Step 4:** implement `src/server/context.ts` (builds a `ReqCtx` from a `Request` + deps: parsed cookies, method, url, params) and `src/server/guards.ts`:
  - `getSessionUser(ctx, deps): User | null` — read `session` cookie, `verifySession(token, secret, {nowSeconds, maxAgeSeconds: SESSION_MAX_AGE})`, map to `User` with `isAdmin(email, adminEmails)`.
  - `checkCsrf(ctx): boolean` — constant-time compare `csrf` cookie vs `X-CSRF-Token` header.
  - Constants `SESSION_MAX_AGE = 8*60*60`, `MAX_UPLOAD_BYTES = 110*1024*1024` live here (moved from old app.ts).
  Use `crypto.timingSafeEqual` over `Buffer.from`.
- [ ] **Step 5 (test-first): handler skeleton + /api/me + auth gate** — `src/server/handler.test.ts`: build handler with mock deps (in-memory repo, mock mailer/storage, fixed now, signed session). Assert: GET `/api/me` without session → 401; with valid `session` cookie → 200 JSON `{email,name,isAdmin}`. Run → FAIL.
- [ ] **Step 6:** implement `src/server/handler.ts`:
  - `makeHandler(deps): (req: Request) => Promise<Response>`.
  - Build `ctx`. If path starts with `/api/`: require session (else 401 JSON). For mutating (`POST`) `/api/*` except none-exempt: enforce CSRF (else 403) and Content-Length cap (413).
  - Route table (manual matching with a small matcher for `:id`). For A1 only `/api/me` implemented; others 404 placeholder.
  - JSON helper `json(data, status)`; `text(s, status)`.
- [ ] **Step 7:** Run `bun test` → all green (existing Hono tests + new server tests).
- [ ] **Step 8:** Commit `feat: bun.serve http foundation (cookies, guards, handler, /api/me)`.

## Task A2: Requests API (my, create, detail, reply)
**Files:** Create `src/server/uploads.ts` (move logic from `src/routes/uploads.ts`, unchanged — File-based), `src/server/routes/requests.ts`; wire into handler. Tests in `src/server/handler.test.ts` (extend) or `requests.test.ts`.
Port the exact logic from `src/routes/public.ts` (read it), returning JSON instead of HTML/redirect:
- `GET /api/my` → `repo.listByEmail(user.email)` as JSON array.
- `POST /api/requests` (multipart) → `newRequestSchema` parse; `processUploads`; `repo.createRequest`; send admin+requester mails (best-effort); `201 {id}`. On validation fail → `400 {errors}`. CSRF enforced by handler.
- **Body-size enforcement (real cap):** the handler's Content-Length check is only a fast-path reject (bypassable via chunked/lying headers). In the multipart handlers, after reading files, enforce real total size against `MAX_UPLOAD_BYTES` and reject 413 if exceeded. (Combined with A5's `Bun.serve({ maxRequestBodySize })`.)
- `GET /api/requests/:id` → id NaN→404; `getRequest`; `canViewRequest` else 404; return `{request, messages, attachments}`.
- `POST /api/requests/:id/reply` (multipart) → canView else 404; canReply else 403; `replySchema`; uploads; `addMessageAndTransition(...,"answered",...)`; mails; `204`.
- [ ] Tests (TDD per endpoint): create→201, my returns own only, detail IDOR→404, reply happy + reply-when-terminal→403/409, **multipart POST without CSRF header → 403** (port the existing security test).
- [ ] Run `bun test` green. Commit `feat: requests JSON API`.

## Task A3: Admin API (list, message, decision)
**Files:** `src/server/routes/admin.ts`; wire into handler. Port from `src/routes/admin.ts`:
- All require `user.isAdmin` else 403.
- `GET /api/admin/requests?status=` → `repo.listAll({status})` JSON.
- `POST /api/admin/requests/:id/message` (multipart) → getRequest else 404; `messageSchema`; `canTransition(status,"clarifying")` else 409; uploads; `addMessageAndTransition(...,"clarifying")`; mail; 204.
- `POST /api/admin/requests/:id/decision` → `decisionSchema`; target accept→accepted/reject→rejected; `canTransition` else 409; `addMessageAndTransition` (reason message or null); mail; 204.
- [ ] Tests (TDD): admin list, non-admin→403, message FSM 409 on terminal, decision accept/reject, decision on closed→409.
- [ ] Run `bun test` green. Commit `feat: admin JSON API`.

## Task A4: Auth routes + attachments binary
**Files:** `src/server/routes/auth.ts`, `src/server/routes/attachments.ts`; wire. Port from `src/routes/auth.ts` + the attachment handler in `src/routes/public.ts`:
- `GET /auth/google` → set `oauth_state` cookie, redirect to `buildAuthUrl`.
- `GET /auth/google/callback` → validate state vs cookie (else 400); `exchangeCode`; `verifyDomain` else 403; `signSession`; set `session` cookie (httpOnly) + a fresh non-httpOnly `csrf` cookie; redirect `/my`. **Both cookies get `secure: config.appBaseUrl.startsWith("https")`.** Minting csrf at login is the canonical fix for the bootstrap catch-22 — the client always has a csrf cookie before its first mutating request.
- `POST /logout` → expire `session` + `csrf`; redirect `/auth/google`. CSRF-exempt.
- `GET /requests/:id/attachments/:attId` → NaN→404; attachment+request ownership/authz else 404; `storage.read` else 404; headers: nosniff, CSP sandbox, allowlist→inline else attachment, filename sanitized, `Cache-Control: private, max-age=300`; return bytes.
- [ ] Tests (TDD): callback domain-reject→403; **attachment nosniff + CSP sandbox + non-allowlisted forced attachment** (port existing); IDOR attachment→404; logout clears cookies.
- [ ] **CSRF cookie issuance:** ensure a `csrf` cookie is minted for an authenticated session if absent (handler mints it on any authenticated GET, like old middleware). Add to handler + test (GET `/api/me` sets `csrf` cookie when missing).
- [ ] Run `bun test` green. Commit `feat: auth + attachment handlers`.

## Task A5: Cut over to Bun.serve, delete Hono
**Files:** Rewrite `src/index.ts`; delete `src/app.ts`, `src/routes/{auth,public,admin}.ts` + their `*.test.ts`, `src/views/views.tsx`, `src/render.tsx`, `src/render.test.tsx`; `bun remove hono`. Keep `src/routes/uploads.ts`? (logic moved to `src/server/uploads.ts` in A2 — delete old `src/routes/uploads.ts` and its test, or keep test by repointing import). 
- [ ] `src/index.ts`:
```ts
import { loadConfig } from "./config";
import { openDb } from "./db/db";
import { makeRepo } from "./db/repo";
import { makeMailer, transportFromConfig } from "./mail/mailer";
import { makeFsStorage } from "./storage/storage";
import { makeHandler } from "./server/handler";

const config = loadConfig(process.env);
const db = openDb(config.dbPath);
const repo = makeRepo(db);
const mailer = makeMailer(transportFromConfig(config), config.mailFrom);
const storage = makeFsStorage(config.uploadDir);
const handler = makeHandler({ config, repo, mailer, storage, now: () => new Date().toISOString() });

Bun.serve({ port: config.port, maxRequestBodySize: 110 * 1024 * 1024, fetch: handler });
console.log(`Talep Portalı çalışıyor: ${config.appBaseUrl} (port ${config.port})`);
```
(SPA `routes`/`index.html` eklenir Alt-proje B'de.)
- [ ] Delete old Hono files + tests. Move/port any still-valuable assertions into server tests.
- [ ] `bun remove hono`. Run `bun test` → all green (no Hono refs). `bun run src/index.ts` boots without error (smoke).
- [ ] Commit `refactor: cut over to Bun.serve, remove Hono`.

---

# ALT-PROJE B — Frontend (Client SPA)

## Task B1: SPA shell + Bun fullstack wiring + api client
**Files:** `src/client/index.html`, `src/client/main.tsx`, `src/client/app.tsx`, `src/client/api.ts` (+test), update `src/index.ts` (serve index.html via Bun.serve `routes`), `package.json` scripts (`dev` uses `bun --hot`; Bun bundles client from index.html).
- `index.html` imports `main.tsx` and `../styles/app.css`. `Bun.serve({ routes: { "/": indexHtml, "/api/*": ..., ... }, fetch: handler })` — Bun auto-bundles. (Verify Bun fullstack HTML serving works at 1.3.13; fallback: `bun build src/client/main.tsx` + static serve.)
- `api.ts`: `apiGet(path)`, `apiSend(path, method, body)` — adds `X-CSRF-Token` from `csrf` cookie (read via `document.cookie`), `credentials: "same-origin"`; on 401 → `location.href="/auth/google"`.
- [ ] Test `api.ts` CSRF-header + 401-redirect logic (mock fetch + document.cookie). Commit `feat: SPA shell + api client`.

## Task B2: Login + New Request pages
- `pages/Login.tsx` (button → `/auth/google`), `pages/NewRequest.tsx` (form → `apiSend("/api/requests","POST",FormData)`; native selects; shadcn; Stitch). Client routing in `app.tsx`.
- [ ] Light render tests. Commit `feat: login + new-request pages`.

## Task B3: My list + Request detail
- `pages/MyList.tsx` (GET `/api/my`, RequestCard + StatusBadge), `pages/RequestDetail.tsx` (GET detail; thread; attachments; reply form → multipart).
- [ ] Render tests. Commit `feat: my-list + request-detail pages`.

## Task B4: Admin panel + decision dialog
- `pages/Admin.tsx` (status tabs, list), decision actions (accept + reject dialog via shadcn `@radix-ui/react-dialog`), admin message form.
- [ ] Render tests. Commit `feat: admin panel`.

## Task B5: CLAUDE.md + final verification
- Update CLAUDE.md §1 (Bun.serve fullstack, SPA, Bun bundler), §2 (layer table: `src/server/`, `src/client/`), §4 (CSRF double-submit header).
- [ ] `bun test` all green; `bun run src/index.ts` + manual browser smoke (login flow, create, admin decision, Stitch styling). Commit. Then `superpowers:finishing-a-development-branch`.

---

## Notlar
- Her task TDD + sonunda `bun test` yeşil. A1-A4 boyunca Hono paralel durur (testler yeşil), A5'te tek seferde sökülür.
- Güvenlik testleri (3,4,6,7,8) port edilmeden ilgili task "bitti" sayılmaz.
- DI (`Deps`) korunur: `makeHandler(deps)` testte mock alır, port bağlamadan `handler(new Request(...))` ile test edilir.
