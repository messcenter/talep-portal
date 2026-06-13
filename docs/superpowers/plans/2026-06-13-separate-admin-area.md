# Ayrı Admin Alanı — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Admin'i kendi layout'u (sidebar'lı konsol) ve kendi sayfaları (panel, tanımlar, ayrı admin talep-detayı `/admin/requests/:id`) olan ayrı bir alana taşımak; çalışan tarafını (`/yeni`, `/my`, `/requests/:id` cevap görünümü) ayırmak. Paylaşılan role-branching detay sayfası kalkar.

**Architecture:** Tek SPA/bundle. `AuthGate` (/api/me + UserContext) altında iki layout: `EmployeeLayout` (üst header), `AdminLayout` (sidebar, admin-gate). İki ayrı talep-detay sayfası ortak `useRequestDetail` hook'u + `RequestMeta`/`Thread`/`Attachments`/`ReplyForm`/`AdminControls` bileşenlerini paylaşır. Backend değişmez.

**Tech Stack:** React 19 SPA (react-router v7), Bun.serve. Frontend testi build-gate (DOM harness yok).

---

## Dosya haritası
- YENİ: `src/client/layouts/AuthGate.tsx`, `EmployeeLayout.tsx`, `AdminLayout.tsx`
- YENİ: `src/client/hooks/useRequestDetail.ts`
- YENİ: `src/client/components/RequestMeta.tsx`
- YENİ: `src/client/pages/RequestDetailEmployee.tsx`, `RequestDetailAdmin.tsx`
- DEĞİŞİR: `src/client/app.tsx` (rota ağacı), `src/index.ts` (`/admin/requests/:id` shell), `src/client/components/RequestCard.tsx` (basePath prop), `src/client/pages/AdminList.tsx` (RequestCard basePath), `src/client/components/AdminControls.tsx` (ReplyForm/inputClass paylaşımı için dokunulmaz — sadece import yeri)
- SİLİNİR: `src/client/pages/RequestDetail.tsx` (eski tek sayfa)

Not: `ReplyForm`, `inputClass`, `fileInputClass`, `Spinner` şu an `RequestDetail.tsx` içinde gömülü. Bunları paylaşılabilir hale getirmek için Task 1'de `src/client/components/forms.ts` (inputClass/fileInputClass) ve `src/client/components/ReplyForm.tsx` ve `src/client/components/Spinner.tsx`'e çıkarılır.

---

## Task 1: Paylaşılan parçaları çıkar (forms, Spinner, ReplyForm, RequestMeta, RequestCard basePath)

**Files:** Create `src/client/components/forms.ts`, `src/client/components/Spinner.tsx`, `src/client/components/ReplyForm.tsx`, `src/client/components/RequestMeta.tsx`; Modify `src/client/components/RequestCard.tsx`, `src/client/pages/RequestDetail.tsx` (eskisini bu parçaları kullanacak şekilde geçici güncelle — hâlâ çalışır).

- [ ] **Step 1: forms.ts**
Create `src/client/components/forms.ts` (RequestDetail.tsx'teki sabitlerin birebir kopyası):
```ts
export const inputClass =
  "block w-full rounded border border-border-subtle bg-white px-3 py-2 text-sm text-on-surface " +
  "placeholder:text-on-surface-variant/50 " +
  "focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary " +
  "disabled:opacity-50 disabled:bg-surface-tonal";

export const fileInputClass =
  "block w-full text-sm text-on-surface-variant " +
  "file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-border-subtle " +
  "file:text-xs file:font-semibold file:uppercase file:tracking-wide " +
  "file:text-on-surface-variant file:bg-surface-tonal file:cursor-pointer " +
  "hover:file:bg-surface-container disabled:opacity-50";

export const fileAccept = "image/png,image/jpeg,image/webp,image/gif,application/pdf";
```

- [ ] **Step 2: Spinner.tsx**
Create `src/client/components/Spinner.tsx`:
```tsx
export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div
        className="w-7 h-7 rounded-full border-2 border-border-subtle border-t-primary animate-spin"
        role="status"
        aria-label="Yükleniyor"
      />
    </div>
  );
}
```

- [ ] **Step 3: ReplyForm.tsx**
Create `src/client/components/ReplyForm.tsx` — move the `ReplyForm` function from `RequestDetail.tsx` here verbatim, but import `inputClass`/`fileInputClass`/`fileAccept` from `./forms`, `Button` from `../../components/ui/button`, `apiSend` from `../api`. Keep its exact behavior (posts to `/api/requests/${requestId}/reply`, 403 message, reset+onSuccess). Export `ReplyForm`.

- [ ] **Step 4: RequestMeta.tsx**
Create `src/client/components/RequestMeta.tsx` — extract the meta `Card` block from RequestDetail (request_no/title/StatusBadge, sub-line, Açıklama, Beklenen Fayda, request-level attachments):
```tsx
import { Card } from "../../components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { Attachments, type AttachmentRow } from "./Attachments";
import { PRIORITY_LABEL } from "../labels";
import type { RequestRow } from "./RequestCard";

export function RequestMeta({ req, requestAtts }: { req: RequestRow; requestAtts: AttachmentRow[] }) {
  return (
    <Card className="p-4 mb-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h1 className="font-mono text-primary text-base font-semibold">{req.request_no}</h1>
          <p className="text-on-surface font-medium text-lg leading-snug mt-0.5">{req.title}</p>
        </div>
        <StatusBadge status={req.status} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-on-surface-variant mb-4">
        <span>{PRIORITY_LABEL[req.priority] ?? req.priority}</span>
        <span>·</span><span>{req.department}</span>
        <span>·</span><span>{req.application}</span>
        {req.module_area && (<><span>·</span><span>{req.module_area}</span></>)}
      </div>
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-1">Açıklama</p>
        <p className="text-sm text-on-surface whitespace-pre-wrap">{req.description}</p>
      </div>
      <div className="mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-1">Beklenen Fayda</p>
        <p className="text-sm text-on-surface whitespace-pre-wrap">{req.expected_benefit}</p>
      </div>
      {requestAtts.length > 0 && <Attachments requestId={req.id} attachments={requestAtts} />}
    </Card>
  );
}
```

- [ ] **Step 5: RequestCard basePath**
Modify `src/client/components/RequestCard.tsx`: add an optional `basePath` prop (default `"/requests"`) and use it in the `Link`:
```tsx
export function RequestCard({ r, basePath = "/requests" }: { r: RequestRow; basePath?: string }) {
  return (
    <Link to={`${basePath}/${r.id}`} className="block border border-border-subtle rounded-lg p-4 bg-white hover:bg-surface-tonal transition-colors no-underline">
      {/* ...unchanged inner JSX... */}
```
(Keep the rest of the component identical.)

- [ ] **Step 6: Update old RequestDetail.tsx to use the extracted pieces (keep it working)**
In `src/client/pages/RequestDetail.tsx`: remove the now-extracted `ReplyForm`, `Spinner`, `inputClass`, `fileInputClass` definitions; import them from the new modules; replace the inline meta Card with `<RequestMeta req={req} requestAtts={requestAtts} />`. Behavior unchanged. (This page is deleted in Task 4; updating it now keeps the build green between tasks.)

- [ ] **Step 7: Build gate + commit**
Run: `bun run build` → succeeds. `bun test` → 192 green.
```bash
git add src/client/components/forms.ts src/client/components/Spinner.tsx src/client/components/ReplyForm.tsx src/client/components/RequestMeta.tsx src/client/components/RequestCard.tsx src/client/pages/RequestDetail.tsx
git commit -m "refactor: extract shared detail pieces (forms, Spinner, ReplyForm, RequestMeta) + RequestCard basePath"
```

---

## Task 2: useRequestDetail hook + two detail pages

**Files:** Create `src/client/hooks/useRequestDetail.ts`, `src/client/pages/RequestDetailEmployee.tsx`, `src/client/pages/RequestDetailAdmin.tsx`. (Not wired into routes yet — Task 4 wires them. They compile as unused.)

- [ ] **Step 1: useRequestDetail.ts**
```tsx
import { useState, useEffect, useCallback } from "react";
import { apiGet } from "../api";
import type { AttachmentRow } from "../components/Attachments";
import type { MessageRow } from "../components/Thread";
import type { RequestRow } from "../components/RequestCard";

export interface DetailData {
  request: RequestRow;
  messages: MessageRow[];
  attachments: AttachmentRow[];
}

export function useRequestDetail(id: string | undefined) {
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    apiGet<DetailData>(`/api/requests/${id}`)
      .then(setData)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "404") setNotFound(true);
        else setError(msg);
      });
  }, [id]);

  useEffect(() => { load(); }, [load]);
  return { data, error, notFound, load };
}
```

- [ ] **Step 2: Shared partition helper + RequestDetailEmployee.tsx**
Create `src/client/pages/RequestDetailEmployee.tsx`:
```tsx
import { useParams } from "react-router-dom";
import { useUser } from "../auth";
import { Card } from "../../components/ui/card";
import { Spinner } from "../components/Spinner";
import { RequestMeta } from "../components/RequestMeta";
import { Thread } from "../components/Thread";
import { ReplyForm } from "../components/ReplyForm";
import { Attachments, type AttachmentRow } from "../components/Attachments";
import { useRequestDetail } from "../hooks/useRequestDetail";

function partition(attachments: AttachmentRow[]) {
  const requestAtts = attachments.filter((a) => a.message_id === null);
  const byMsg = new Map<number, AttachmentRow[]>();
  for (const a of attachments) {
    if (a.message_id !== null) {
      const b = byMsg.get(a.message_id) ?? []; b.push(a); byMsg.set(a.message_id, b);
    }
  }
  return { requestAtts, byMsg };
}

export function RequestDetailEmployee() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const { data, error, notFound, load } = useRequestDetail(id);

  if (!data && !error && !notFound) return <main className="max-w-4xl mx-auto px-4 py-6"><Spinner /></main>;
  if (notFound) return <main className="max-w-4xl mx-auto px-4 py-6"><div className="text-center py-16 text-on-surface-variant">Talep bulunamadı.</div></main>;
  if (error) return <main className="max-w-4xl mx-auto px-4 py-6"><div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded p-3 text-sm">{error}</div></main>;
  if (!data) return null;

  const { request: req, messages } = data;
  const { requestAtts, byMsg } = partition(data.attachments);
  const isOwner = user.email.toLowerCase() === req.requester_email.toLowerCase();
  const canReply = isOwner && req.status === "clarifying";

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      <RequestMeta req={req} requestAtts={requestAtts} />
      <Card className="p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant mb-4">Yazışma</h2>
        <Thread messages={messages} attachmentsByMessage={byMsg} requestId={req.id} />
        {canReply && (<><div className="border-t border-border-subtle mt-6" /><ReplyForm requestId={req.id} onSuccess={load} /></>)}
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: RequestDetailAdmin.tsx**
Create `src/client/pages/RequestDetailAdmin.tsx`:
```tsx
import { useParams, Link } from "react-router-dom";
import { useUser } from "../auth";
import { Card } from "../../components/ui/card";
import { Spinner } from "../components/Spinner";
import { RequestMeta } from "../components/RequestMeta";
import { Thread } from "../components/Thread";
import { AdminControls } from "../components/AdminControls";
import { type AttachmentRow } from "../components/Attachments";
import { useRequestDetail } from "../hooks/useRequestDetail";

function partition(attachments: AttachmentRow[]) {
  const requestAtts = attachments.filter((a) => a.message_id === null);
  const byMsg = new Map<number, AttachmentRow[]>();
  for (const a of attachments) {
    if (a.message_id !== null) {
      const b = byMsg.get(a.message_id) ?? []; b.push(a); byMsg.set(a.message_id, b);
    }
  }
  return { requestAtts, byMsg };
}

export function RequestDetailAdmin() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const { data, error, notFound, load } = useRequestDetail(id);

  if (!data && !error && !notFound) return <main className="max-w-4xl mx-auto px-4 py-6"><Spinner /></main>;
  if (notFound) return <main className="max-w-4xl mx-auto px-4 py-6"><div className="text-center py-16 text-on-surface-variant">Talep bulunamadı.</div></main>;
  if (error) return <main className="max-w-4xl mx-auto px-4 py-6"><div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded p-3 text-sm">{error}</div></main>;
  if (!data) return null;

  const { request: req, messages } = data;
  const { requestAtts, byMsg } = partition(data.attachments);
  const isOwner = user.email.toLowerCase() === req.requester_email.toLowerCase();

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      <RequestMeta req={req} requestAtts={requestAtts} />
      <Card className="p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant mb-4">Yazışma</h2>
        <Thread messages={messages} attachmentsByMessage={byMsg} requestId={req.id} />
        {isOwner ? (
          <div className="mt-6 border-t border-border-subtle pt-4 text-sm text-on-surface-variant">
            Bu sizin talebiniz; yönetici işlemi yapamazsınız.{" "}
            <Link to={`/requests/${req.id}`} className="text-primary underline">Cevaplamak için Taleplerim'e gidin</Link>.
          </div>
        ) : (
          <AdminControls requestId={req.id} status={req.status} onDone={load} />
        )}
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Build gate + commit**
Run: `bun run build` → succeeds (new pages compile, unused for now). `bun test` → 192.
```bash
git add src/client/hooks/useRequestDetail.ts src/client/pages/RequestDetailEmployee.tsx src/client/pages/RequestDetailAdmin.tsx
git commit -m "feat: separate employee + admin request-detail pages (shared hook/meta)"
```

---

## Task 3: AuthGate + EmployeeLayout + AdminLayout

**Files:** Create `src/client/layouts/AuthGate.tsx`, `EmployeeLayout.tsx`, `AdminLayout.tsx`. (Wired in Task 4.)

- [ ] **Step 1: AuthGate.tsx** (extract /api/me + context from current AppLayout)
```tsx
import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { apiGet } from "../api";
import { UserContext, type User } from "../auth";

export function AuthGate() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    apiGet<User>("/api/me")
      .then((u) => { if (!cancelled) { setUser(u); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); }); // 401 → api.ts redirects
    return () => { cancelled = true; };
  }, []);
  if (loading) return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-border-subtle border-t-primary animate-spin" role="status" aria-label="Yükleniyor" />
      <span className="text-sm text-on-surface-variant">Yükleniyor…</span>
    </div>
  );
  if (!user) return null;
  return (
    <UserContext.Provider value={user}>
      <Outlet />
    </UserContext.Provider>
  );
}
```

- [ ] **Step 2: EmployeeLayout.tsx**
```tsx
import { NavLink, Outlet } from "react-router-dom";
import { useUser } from "../auth";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  ["text-sm font-medium px-3 py-1 rounded transition-colors",
   isActive ? "bg-primary text-primary-fg" : "text-primary hover:bg-surface-container"].join(" ");

export function EmployeeLayout() {
  const user = useUser();
  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-white border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <NavLink to="/my" className="font-semibold text-primary tracking-tight text-base">Talep Portalı</NavLink>
          <nav className="flex items-center gap-1">
            <NavLink to="/my" className={linkClass}>Taleplerim</NavLink>
            <NavLink to="/yeni" className={linkClass}>Yeni Talep</NavLink>
            {user.isAdmin && (
              <>
                <span className="mx-1 h-5 w-px bg-border-subtle" aria-hidden="true" />
                <NavLink to="/admin" className={linkClass}>Yönetim →</NavLink>
              </>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-xs text-on-surface-variant hidden sm:block truncate max-w-[160px]">{user.name || user.email}</span>
            <form method="post" action="/logout"><button type="submit" className="text-sm font-medium text-secondary hover:text-on-surface transition-colors">Çıkış</button></form>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 3: AdminLayout.tsx** (sidebar console, admin-gated)
```tsx
import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useUser } from "../auth";

const sideLink = ({ isActive }: { isActive: boolean }) =>
  ["block px-3 py-2 rounded text-sm font-medium transition-colors",
   isActive ? "bg-primary text-primary-fg" : "text-on-surface hover:bg-surface-container"].join(" ");

export function AdminLayout() {
  const user = useUser();
  if (!user.isAdmin) return <Navigate to="/my" replace />;
  return (
    <div className="min-h-screen bg-surface flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 bg-surface-tonal border-r border-border-subtle min-h-screen flex flex-col">
        <div className="px-4 h-14 flex items-center border-b border-border-subtle">
          <span className="font-semibold text-primary tracking-tight text-sm leading-tight">Talep Portalı<br /><span className="text-on-surface-variant font-normal text-xs">Yönetim</span></span>
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-1">
          <NavLink to="/admin" end className={sideLink}>Tüm Talepler</NavLink>
          <NavLink to="/admin/tanimlar" className={sideLink}>Tanımlar</NavLink>
          <div className="mt-auto pt-3 border-t border-border-subtle">
            <NavLink to="/my" className="block px-3 py-2 rounded text-sm text-secondary hover:bg-surface-container">← Çalışan alanı</NavLink>
          </div>
        </nav>
        <div className="p-3 border-t border-border-subtle flex items-center justify-between gap-2">
          <span className="text-xs text-on-surface-variant truncate">{user.name || user.email}</span>
          <form method="post" action="/logout"><button type="submit" className="text-xs font-medium text-secondary hover:text-on-surface">Çıkış</button></form>
        </div>
      </aside>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
```
(Sidebar uses `mt-auto` to push the "Çalışan alanı" link + user/logout down. Adjust flex if needed so it renders sensibly.)

- [ ] **Step 4: Build gate + commit**
Run: `bun run build` → succeeds (layouts compile, unused). `bun test` → 192.
```bash
git add src/client/layouts
git commit -m "feat: AuthGate + EmployeeLayout + AdminLayout (sidebar console)"
```

---

## Task 4: Wire the route tree + index.ts + AdminList; delete old page

**Files:** Modify `src/client/app.tsx`, `src/index.ts`, `src/client/pages/AdminList.tsx`; Delete `src/client/pages/RequestDetail.tsx`.

- [ ] **Step 1: Rewrite app.tsx**
Replace `src/client/app.tsx` with the new tree (keep `Login` import; remove the old `AppLayout`/`Spinner`/`linkClass` now living in layouts):
```tsx
// src/client/app.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useUser } from "./auth";
import { AuthGate } from "./layouts/AuthGate";
import { EmployeeLayout } from "./layouts/EmployeeLayout";
import { AdminLayout } from "./layouts/AdminLayout";
import { Login } from "./pages/Login";
import { NewRequest } from "./pages/NewRequest";
import { MyList } from "./pages/MyList";
import { RequestDetailEmployee } from "./pages/RequestDetailEmployee";
import { RequestDetailAdmin } from "./pages/RequestDetailAdmin";
import { Admin } from "./pages/Admin";
import { Definitions } from "./pages/Definitions";

function Home() {
  const user = useUser();
  return <Navigate to={user.isAdmin ? "/admin" : "/my"} replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AuthGate />}>
          <Route index element={<Home />} />
          <Route element={<EmployeeLayout />}>
            <Route path="/yeni" element={<NewRequest />} />
            <Route path="/my" element={<MyList />} />
            <Route path="/requests/:id" element={<RequestDetailEmployee />} />
          </Route>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/tanimlar" element={<Definitions />} />
            <Route path="/admin/requests/:id" element={<RequestDetailAdmin />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: AdminList cards → /admin/requests**
In `src/client/pages/AdminList.tsx`, pass `basePath="/admin/requests"` to each `<RequestCard>`. (Find the `.map(... <RequestCard key=... r=... />)` and add the prop.) MyList stays default (`/requests`).

- [ ] **Step 3: index.ts — add /admin/requests/:id shell route**
In `src/index.ts` `routes`, add `"/admin/requests/:id": spaShell,` next to `/admin/tanimlar`. (Single-segment `:id`; deep-link/refresh serves shell. Does NOT shadow `/requests/:id/attachments/:attId` — different prefix.)

- [ ] **Step 4: Delete old page**
`git rm src/client/pages/RequestDetail.tsx`. Confirm nothing imports it: `grep -rn "pages/RequestDetail\"" src` → only the deleted refs (app.tsx now imports the two new pages). Fix any stragglers.

- [ ] **Step 5: Build gate + commit**
Run: `bun run build` → succeeds. `bun test` → 192. `grep -rn "AppLayout" src` → no stale references (old AppLayout removed; if app.tsx had it inline it's gone).
```bash
git add src/client/app.tsx src/index.ts src/client/pages/AdminList.tsx src/client/pages/RequestDetail.tsx
git commit -m "feat: wire separate employee/admin areas; admin list → /admin/requests/:id"
```

---

## Task 5: CLAUDE.md + final verification + visual

**Files:** Modify `CLAUDE.md`.

- [ ] **Step 1: CLAUDE.md §2**
Update the `src/client/` row to mention `layouts/` (AuthGate, EmployeeLayout, AdminLayout), `hooks/`, and the two detail pages. Keep concise.

- [ ] **Step 2: Full test + build**
Run: `bun test` → 192 green. `bun run build` → succeeds.

- [ ] **Step 3: Visual smoke (seeded server + minted cookies)**
Start server with dev-tour.db (or a fresh seeded DB) and an admin cookie. Verify:
- Admin visits `/` → `/admin`, sees **sidebar console** (Tüm Talepler / Tanımlar / ← Çalışan alanı).
- Admin clicks a request owned by someone ELSE → `/admin/requests/:id` with Soru ekle + Kabul/Ret (admin layout).
- Admin clicks their OWN request in the list → `/admin/requests/:id` shows the "Bu sizin talebiniz … Taleplerim" notice (no controls).
- Admin goes to "← Çalışan alanı" → `/my` (employee layout, top header); opens own clarifying request → `/requests/:id` with **Cevapla**.
- Normal user → `/my` employee layout; no admin links; `/requests/:id` cevap.
- Deep-link refresh on `/admin/requests/:id` and `/requests/:id` both load.

- [ ] **Step 4: finishing-a-development-branch**
Use `superpowers:finishing-a-development-branch`.

---

## Self-Review Notları
- **Spec kapsamı:** §3.1 layouts→Task3; §3.2 rotalar→Task4; §3.3 iki detay→Task2; §3.4 kart linkleri→Task1(basePath)+Task4(AdminList); §3.5 DRY→Task1; §3.6 index.ts→Task4; §4 matris→Task2/3 mantığı. Tümü karşılanıyor.
- **Incremental green:** Task1-3 yeni parçaları ekler (eski sayfa çalışmaya devam eder), Task4 cutover yapar. Her task `bun run build` + `bun test` 192 yeşil ile biter.
- **Backend dokunulmaz** — sadece `src/client/` + `src/index.ts` + CLAUDE.md.
- **Tip tutarlılığı:** `DetailData` artık `useRequestDetail.ts`'te tek tanım; iki sayfa onu kullanır. `RequestCard` `basePath` opsiyonel (MyList default `/requests`, AdminList `/admin/requests`). `RequestMeta`/`ReplyForm`/`Spinner` tek kaynak.
- **Mail linkleri** zaten `/admin/requests/:id` ve `/requests/:id`'e işaret ediyor (doğrulandı) — yeni rotalarla artık çalışır.
