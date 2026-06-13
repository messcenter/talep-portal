# Çalışan / Yönetim Alan Ayrımı — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Admin ile çalışan deneyimini ayırmak: rol-bazlı iniş + gruplu nav + talep detayında kontrolleri `isAdmin` yerine talebe ilişkiye göre belirlemek (sahip→cevapla, admin+başkası→karar, kendi talebinde karar yok).

**Architecture:** Domain `canReply` owner-temelli olur; admin kendi talebinde yönetici işlemi route'da 403 ile engellenir. Frontend'de `/` rol-bazlı yönlendiriciye, Yeni Talep `/yeni`'ye taşınır; RequestDetail kontrolleri ownership'e göre seçer.

**Tech Stack:** Bun.serve, bun:sqlite, React 19 SPA (react-router), Zod.

---

## File map
- `src/domain/authz.ts` (canReply), `src/domain/authz.test.ts`
- `src/server/routes/admin.ts` (self-action 403), `src/server/routes/admin.test.ts`, `src/server/routes/requests.test.ts` (owner-admin reply test)
- `src/client/app.tsx` (routes + nav + landing), `src/index.ts` (add `/yeni` route)
- `src/client/pages/RequestDetail.tsx` (ownership logic), `src/client/pages/MyList.tsx` (links → /yeni)

---

## Task 1: Domain — canReply owner-temelli

**Files:** Modify `src/domain/authz.ts`; Test `src/domain/authz.test.ts`.

- [ ] **Step 1: Update/extend failing tests**

Read `src/domain/authz.test.ts`. The existing `canReply` tests likely assert an admin can NOT reply — those encode the OLD rule and must change. Update them and add the new matrix:
```ts
const clarifying = (email: string) => ({ requester_email: email, status: "clarifying" as const });
const answered = (email: string) => ({ requester_email: email, status: "answered" as const });

test("owner (non-admin) can reply when clarifying", () => {
  const u = { email: "a@x.com", name: "A", isAdmin: false };
  expect(canReply(u, clarifying("a@x.com"))).toBe(true);
});
test("owner who is ALSO admin can reply to their own request when clarifying", () => {
  const u = { email: "boss@x.com", name: "B", isAdmin: true };
  expect(canReply(u, clarifying("boss@x.com"))).toBe(true); // NEW behavior
});
test("admin canNOT reply to someone else's request", () => {
  const u = { email: "boss@x.com", name: "B", isAdmin: true };
  expect(canReply(u, clarifying("a@x.com"))).toBe(false);
});
test("non-owner non-admin canNOT reply", () => {
  const u = { email: "b@x.com", name: "B", isAdmin: false };
  expect(canReply(u, clarifying("a@x.com"))).toBe(false);
});
test("owner canNOT reply when not clarifying (e.g. answered)", () => {
  const u = { email: "a@x.com", name: "A", isAdmin: false };
  expect(canReply(u, answered("a@x.com"))).toBe(false);
});
```
Remove/replace any existing test that asserts `canReply` is false purely because the user is admin (that rule is gone). Keep email-case-insensitivity coverage if present.

- [ ] **Step 2: Run, verify FAIL**

Run: `bun test src/domain/authz.test.ts`
Expected: the "owner who is also admin" test FAILS (current code returns false for admins).

- [ ] **Step 3: Implement**

In `src/domain/authz.ts`, change `canReply` to drop the admin exclusion:
```ts
export function canReply(user: User, req: RequestRef): boolean {
  if (user.email.toLowerCase() !== req.requester_email.toLowerCase()) return false;
  return req.status === "clarifying";
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `bun test src/domain/authz.test.ts` → PASS.

- [ ] **Step 5: Full suite**

Run: `bun test` — NOTE: this change may break route/integration tests that relied on "admin can't reply". Do NOT fix those here; just observe. If `src/server/routes/requests.test.ts` has a test asserting an admin gets 403 on reply purely for being admin, it will be addressed in Task 2. If the full suite is red ONLY due to that, proceed to Task 2; otherwise investigate.

- [ ] **Step 6: Commit**

```bash
git add src/domain/authz.ts src/domain/authz.test.ts
git commit -m "feat: canReply is owner-based (admins can reply to their own requests)"
```

---

## Task 2: Backend — admin self-action 403 + owner-admin reply works

**Files:** Modify `src/server/routes/admin.ts`; Test `src/server/routes/admin.test.ts`, `src/server/routes/requests.test.ts`.

Goal: an admin must NOT run clarification/decision on their OWN request (separation of duties → 403), but CAN reply to it (via the reply route, already gated by the new `canReply`).

- [ ] **Step 1: Failing tests (admin.test.ts)**

Read `src/server/routes/admin.test.ts` harness. Add tests (the admin is `boss@kokilmetal.com.tr`; seed a request whose `requester_email` is the admin's own email, in status `clarifying` or `new`):
```ts
test("admin CANNOT add a clarification message to their OWN request → 403", async () => {
  // seed a request owned by the admin
  const r = repo.createRequest({ /* ...valid fields..., */ requester_name: "Yönetici", requester_email: "boss@kokilmetal.com.tr" } as any, deps.now(), []);
  const res = await handler(reqMultipart(`/api/admin/requests/${r.id}/message`, formWith({ body: "soru" }), adminCookieCsrf()));
  expect(res.status).toBe(403);
});
test("admin CANNOT decide their OWN request → 403", async () => {
  const r = repo.createRequest({ /* ... */ requester_email: "boss@kokilmetal.com.tr" } as any, deps.now(), []);
  const res = await handler(reqForm(`/api/admin/requests/${r.id}/decision`, { decision: "accept" }, adminCookieCsrf()));
  expect(res.status).toBe(403);
});
test("admin CAN act on someone else's request (regression)", async () => {
  const r = repo.createRequest({ /* ... */ requester_email: "ali@kokilmetal.com.tr" } as any, deps.now(), []);
  const res = await handler(reqMultipart(`/api/admin/requests/${r.id}/message`, formWith({ body: "soru" }), adminCookieCsrf()));
  expect(res.status).toBe(204);
});
```
Use the file's actual helpers for building the request seed (match `createRequest`'s required fields: department, application, module_area, request_type, title, description, expected_benefit, priority, requester_name, requester_email — see other admin tests). NOTE: if admin.test.ts seeds requests with a non-admin requester by default, these new tests just set requester_email to the admin's email. The department-strictness from earlier tasks applies to the PUBLIC create route, NOT to `repo.createRequest` directly — so seeding via repo needs no department row.

- [ ] **Step 2: Run, verify FAIL**

Run: `bun test src/server/routes/admin.test.ts`
Expected: the two "own request → 403" tests FAIL (currently 204/200).

- [ ] **Step 3: Implement self-action guard (admin.ts)**

In `src/server/routes/admin.ts`, inside BOTH the `message` and `decision` handlers, AFTER `repo.getRequest(id)` returns a request `r` and BEFORE mutating, add:
```ts
    // Separation of duties: an admin may not run clarify/decide on their OWN request.
    if (r.requester_email.toLowerCase() === user.email.toLowerCase()) {
      return json({ error: "Kendi talebinizde yönetici işlemi yapamazsınız" }, 403, extraHeaders);
    }
```
(Match the exact variable names in the file: the request var, `user`, `json`, `extraHeaders`. Place it right after the existing 404 not-found check for the request.)

- [ ] **Step 4: Run, verify PASS**

Run: `bun test src/server/routes/admin.test.ts` → PASS.

- [ ] **Step 5: Owner-admin reply works (requests.test.ts)**

Add a test in `src/server/routes/requests.test.ts` proving an admin can reply to their OWN clarifying request via the reply route:
```ts
test("admin-owner can reply to their own clarifying request → 204", async () => {
  // seed a request owned by the admin in 'clarifying' status
  const r = repo.createRequest({ /* ...valid..., */ requester_email: "boss@kokilmetal.com.tr", requester_name: "Yönetici" } as any, deps.now(), []);
  repo.addMessageAndTransition(r.id, { role: "admin", body: "soru" }, "clarifying", deps.now());
  const res = await handler(reqMultipart(`/api/requests/${r.id}/reply`, formWith({ body: "cevap" }), adminCookieCsrf()));
  expect(res.status).toBe(204);
});
```
Use the file's helpers (`reqMultipart`/`formWith`/`adminCookieCsrf` — adapt to whatever the file actually defines; admin cookie = boss session + csrf). Run → should PASS already (Task 1 made canReply allow owner-admin). If it FAILS, investigate the reply route.

- [ ] **Step 6: Full suite + commit**

Run: `bun test` → ALL green. Fix any remaining test that encoded the old "admin can't reply" assumption (update its intent to the new rule).
```bash
git add src/server/routes/admin.ts src/server/routes/admin.test.ts src/server/routes/requests.test.ts
git commit -m "feat: admins cannot self-clarify/decide; can reply to own requests"
```

---

## Task 3: Frontend routing — `/` redirector + `/yeni` form

**Files:** Modify `src/client/app.tsx`, `src/index.ts`, `src/client/pages/MyList.tsx`.

- [ ] **Step 1: app.tsx — role-based home redirector + /yeni route**

In `src/client/app.tsx`:
- Add a small redirector component (it can use `useUser()` since it's rendered inside `AppLayout`'s context — but the index route is inside the layout, so context is available):
```tsx
function Home() {
  const user = useUser();
  return <Navigate to={user.isAdmin ? "/admin" : "/my"} replace />;
}
```
Import `useUser` from `./auth` (add to the existing import).
- Change the routes inside the authenticated `<Route element={<AppLayout />}>` group:
```tsx
          <Route index element={<Home />} />
          <Route path="/yeni" element={<NewRequest />} />
          <Route path="/my" element={<MyList />} />
          <Route path="/requests/:id" element={<RequestDetail />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/tanimlar" element={<Definitions />} />
```
(`index` was `<NewRequest/>`; now it's `<Home/>` redirector, and NewRequest moves to `/yeni`.)

- [ ] **Step 2: index.ts — serve SPA shell for /yeni**

In `src/index.ts` `routes`, add `"/yeni": spaShell,` next to the other SPA routes (`/`, `/my`, `/admin`, `/requests/:id`). (Deep-link refresh on /yeni then serves the shell; the text/html 404 fallback would also catch it, but explicit is consistent.)

- [ ] **Step 3: MyList — link "Yeni talep" to /yeni**

In `src/client/pages/MyList.tsx`, change both `<Link to="/">` occurrences (the header button and the empty-state link, lines ~47 and ~70) to `<Link to="/yeni">`.

- [ ] **Step 4: Build gate**

Run: `bun run build` → succeeds. `bun test` → green (no test depends on these client routes).

- [ ] **Step 5: Commit**

```bash
git add src/client/app.tsx src/index.ts src/client/pages/MyList.tsx
git commit -m "feat: role-based home redirector; move new-request to /yeni"
```

---

## Task 4: Frontend — RequestDetail ownership-based controls

**Files:** Modify `src/client/pages/RequestDetail.tsx`.

- [ ] **Step 1: Replace isAdmin-based logic with ownership-based**

In `src/client/pages/RequestDetail.tsx`:
- Compute ownership next to the existing canReply block (~line 212):
```tsx
  const isOwner =
    user.email.toLowerCase() === req.requester_email.toLowerCase();
  // Reply form: the owner (even if admin) replies while clarifying.
  const canReply = isOwner && req.status === "clarifying";
```
(Remove the old `!user.isAdmin && ...` definition.)
- Change the AdminControls render condition (~line 290) from `{user.isAdmin && (` to:
```tsx
        {user.isAdmin && !isOwner && (
          <AdminControls requestId={req.id} status={req.status} onDone={load} />
        )}
```
So an admin viewing their OWN request does NOT see clarify/decide controls (they see the reply form instead). The reply form block (`{canReply && ...}`) stays as-is.

- [ ] **Step 2: Build gate**

Run: `bun run build` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/client/pages/RequestDetail.tsx
git commit -m "feat: request detail controls based on ownership, not just admin flag"
```

---

## Task 5: Frontend — grouped nav + role-aware brand link

**Files:** Modify `src/client/app.tsx`.

- [ ] **Step 1: Group the nav into Çalışan / Yönetim areas**

In `AppLayout`'s `<nav>`, render two visually-separated groups. Employee links always; Yönetim group only for admins, separated by a divider:
```tsx
            <nav className="flex items-center gap-1">
              {/* Çalışan alanı */}
              <NavLink to="/my" className={linkClass}>Taleplerim</NavLink>
              <NavLink to="/yeni" className={linkClass}>Yeni Talep</NavLink>
              {user.isAdmin && (
                <>
                  <span className="mx-1 h-5 w-px bg-border-subtle" aria-hidden="true" />
                  {/* Yönetim alanı */}
                  <NavLink to="/admin" className={linkClass}>Tüm Talepler</NavLink>
                  <NavLink to="/admin/tanimlar" className={linkClass}>Tanımlar</NavLink>
                </>
              )}
            </nav>
```
(Adds the "Yeni Talep" link to the nav; renames admin "Yönetim" → "Tüm Talepler"; adds a divider before the admin group.)

- [ ] **Step 2: Brand link role-aware**

Change the brand `<NavLink to="/">` so the logo lands each role on their home. Simplest: keep `to="/"` — the `Home` redirector (Task 3) already routes admin→/admin, employee→/my. So NO change needed; `/` resolves correctly per role. Confirm this works (clicking brand → `/` → Home redirects by role). Leave `to="/"`.

- [ ] **Step 3: Build gate**

Run: `bun run build` → succeeds. `bun test` → green.

- [ ] **Step 4: Commit**

```bash
git add src/client/app.tsx
git commit -m "feat: grouped employee/management navigation"
```

---

## Task 6: Final verification + visual smoke

**Files:** (none — verification)

- [ ] **Step 1: Full test + build**

Run: `bun test` → all green. `bun run build` → succeeds.

- [ ] **Step 2: Visual smoke (seeded server + minted cookies)**

Start the server with a seeded DB and admin + a normal-user session cookie (see prior seed approach: `bun /tmp/seed.ts`-style mints cookies for boss@ and ali@). Verify in a browser (Playwright or manual):
- Admin logs in / visits `/` → lands on `/admin` (Tüm Talepler). Nav shows grouped: Taleplerim · Yeni Talep | Tüm Talepler · Tanımlar.
- Normal user visits `/` → lands on `/my`. Nav shows only Taleplerim · Yeni Talep.
- "Yeni Talep" → `/yeni` form.
- Admin opens a request owned by ANOTHER user that is `clarifying` → sees Soru ekle + Kabul/Ret (no reply form).
- Admin opens THEIR OWN `clarifying` request → sees "Cevapla" form, NO decide controls. (This is the original bug — now fixed.)
- (Optional) Attempt admin decision on own request via API → 403.

- [ ] **Step 3: finishing-a-development-branch**

Use `superpowers:finishing-a-development-branch`.

---

## Self-Review Notları
- **Spec kapsamı:** §3.1 rotalar→Task3; §3.2 nav→Task5; §3.3 ownership kontrolleri→Task4; §4.1 canReply→Task1; §4.2 self-action 403→Task2; §5 iç linkler→Task3; §6 test→her task + Task6. Tümü karşılanıyor.
- **canReply semantik kırılması:** Task1 Step5 ve Task2 Step6 eski "admin cevaplayamaz" testlerini günceller — açıkça not edildi.
- **İlişki mantığı tutarlı:** `isOwner = email===requester_email` (case-insensitive) hem backend (authz/admin) hem frontend (RequestDetail) aynı tanım.
- **Yönlendirici:** `/` → `<Home/>` (rol-bazlı Navigate); `/yeni` form; index.ts `/yeni` shell servis eder; brand link `/`'da kalır (Home çözer).
- **Tip tutarlılığı:** `Home` bileşeni `useUser()` kullanır (AppLayout context içinde render edilir). AdminControls imzası değişmez (`requestId,status,onDone`), yalnız render koşulu `&& !isOwner` eklenir.
