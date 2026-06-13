# Yönetici Özet Paneli (Dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yönetici alanına, anlık sağlık/iş yükü kırılımı ve 7+ gün hareketsiz açık talep triyajı gösteren bir Özet paneli eklemek; bu paneli `/admin` açılış sayfası yapmak.

**Architecture:** Toplama mantığı saf `src/domain/stats.ts`'te (zero-I/O, exhaustive test). `src/db/repo.ts` her talebi `last_activity_at` ile döndüren tek bir okuma metodu sağlar. `src/server/routes/admin.ts` yeni bir `GET /api/admin/stats` ucu ekler (admin-gate). İstemci yeni `Dashboard.tsx` sayfası bu ucu çekip sade CSS çubuk + sayı kartı + linkli triyaj listesi render eder. Mevcut liste `/admin/talepler`'e taşınır.

**Tech Stack:** Bun + `bun:sqlite`, React 19 SPA, react-router, Tailwind, Zod (mevcut), `bun:test`.

**Spec:** `docs/superpowers/specs/2026-06-13-admin-dashboard-design.md`

---

## File Structure

- **Create** `src/domain/stats.ts` — `AGED_THRESHOLD_DAYS`, tipler, `ageInDays`, saf `buildDashboardStats`.
- **Create** `src/domain/stats.test.ts` — exhaustive birim test.
- **Modify** `src/db/repo.ts` — yeni `listForStats()` metodu.
- **Modify** `src/server/routes/admin.ts` — yeni `GET /api/admin/stats` route'u + import.
- **Modify** `src/server/routes/admin.test.ts` — endpoint entegrasyon testleri (repo+route'u uçtan uca sürer).
- **Create** `src/client/pages/Dashboard.tsx` — özet sayfası.
- **Modify** `src/client/app.tsx` — `/admin` → Dashboard, `/admin/talepler` → Admin (liste), lazy import.
- **Modify** `src/client/layouts/AdminLayout.tsx` — sidebar: Özet · Tüm Talepler · Tanımlar.

---

## Task 1: Domain — `ageInDays` + eşik sabiti

**Files:**
- Create: `src/domain/stats.ts`
- Test: `src/domain/stats.test.ts`

- [ ] **Step 1: Write the failing test**

`src/domain/stats.test.ts`:

```ts
// src/domain/stats.test.ts
import { expect, test, describe } from "bun:test";
import { ageInDays, AGED_THRESHOLD_DAYS } from "./stats";

describe("ageInDays", () => {
  test("counts whole elapsed days, floored", () => {
    expect(ageInDays("2026-06-01T00:00:00.000Z", "2026-06-08T00:00:00.000Z")).toBe(7);
    expect(ageInDays("2026-06-01T00:00:00.000Z", "2026-06-08T23:59:59.000Z")).toBe(7);
    expect(ageInDays("2026-06-01T00:00:00.000Z", "2026-06-01T05:00:00.000Z")).toBe(0);
  });

  test("threshold constant is 7", () => {
    expect(AGED_THRESHOLD_DAYS).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/domain/stats.test.ts`
Expected: FAIL — `Cannot find module './stats'` (dosya yok).

- [ ] **Step 3: Write minimal implementation**

`src/domain/stats.ts`:

```ts
// src/domain/stats.ts — pure dashboard aggregation (zero I/O).
import { isTerminal, type RequestStatus } from "./status";

export const AGED_THRESHOLD_DAYS = 7;

/** Full elapsed days between two ISO timestamps, floored (>= 0 expected). */
export function ageInDays(lastActivityIso: string, nowIso: string): number {
  const ms = new Date(nowIso).getTime() - new Date(lastActivityIso).getTime();
  return Math.floor(ms / 86_400_000);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/domain/stats.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/stats.ts src/domain/stats.test.ts
git commit -m "feat(domain): ageInDays + aged threshold for dashboard stats"
```

---

## Task 2: Domain — `buildDashboardStats`

**Files:**
- Modify: `src/domain/stats.ts`
- Test: `src/domain/stats.test.ts`

- [ ] **Step 1: Write the failing test**

`src/domain/stats.test.ts` dosyasının **sonuna** ekle (üstteki import satırını da güncelle):

İlk satırdaki import'u şununla değiştir:

```ts
import {
  ageInDays,
  AGED_THRESHOLD_DAYS,
  buildDashboardStats,
  type StatsRow,
} from "./stats";
```

Dosyanın sonuna ekle:

```ts
const NOW = "2026-06-13T00:00:00.000Z";

function row(over: Partial<StatsRow>): StatsRow {
  return {
    id: 1,
    request_no: "TLP-0001",
    title: "Başlık",
    status: "new",
    priority: "medium",
    created_at: "2026-06-13T00:00:00.000Z",
    last_activity_at: "2026-06-13T00:00:00.000Z",
    ...over,
  };
}

describe("buildDashboardStats", () => {
  test("empty input → all zeros, empty aged", () => {
    const s = buildDashboardStats([], NOW);
    expect(s.total).toBe(0);
    expect(s.open).toBe(0);
    expect(s.agedCount).toBe(0);
    expect(s.byStatus).toEqual({ new: 0, clarifying: 0, answered: 0, accepted: 0, rejected: 0 });
    expect(s.openByPriority).toEqual({ low: 0, medium: 0, high: 0 });
    expect(s.aged).toEqual([]);
  });

  test("counts every status; total = row count", () => {
    const s = buildDashboardStats(
      [
        row({ id: 1, status: "new" }),
        row({ id: 2, status: "clarifying" }),
        row({ id: 3, status: "answered" }),
        row({ id: 4, status: "accepted" }),
        row({ id: 5, status: "rejected" }),
      ],
      NOW,
    );
    expect(s.total).toBe(5);
    expect(s.byStatus).toEqual({ new: 1, clarifying: 1, answered: 1, accepted: 1, rejected: 1 });
    expect(s.open).toBe(3); // new + clarifying + answered
  });

  test("openByPriority counts only non-terminal requests", () => {
    const s = buildDashboardStats(
      [
        row({ id: 1, status: "new", priority: "high" }),
        row({ id: 2, status: "clarifying", priority: "medium" }),
        row({ id: 3, status: "accepted", priority: "high" }), // terminal → excluded
      ],
      NOW,
    );
    expect(s.openByPriority).toEqual({ low: 0, medium: 1, high: 1 });
  });

  test("aged: only open rows past threshold; boundary is >= 7 days", () => {
    const s = buildDashboardStats(
      [
        row({ id: 1, status: "new", last_activity_at: "2026-06-06T00:00:00.000Z" }), // 7 days → aged
        row({ id: 2, status: "clarifying", last_activity_at: "2026-06-07T00:00:00.000Z" }), // 6 days → not
        row({ id: 3, status: "accepted", last_activity_at: "2026-01-01T00:00:00.000Z" }), // terminal → excluded
      ],
      NOW,
    );
    expect(s.agedCount).toBe(1);
    expect(s.aged.map((a) => a.id)).toEqual([1]);
    expect(s.aged[0]).toEqual({ id: 1, request_no: "TLP-0001", title: "Başlık", status: "new", age_days: 7 });
  });

  test("aged sorted by age descending", () => {
    const s = buildDashboardStats(
      [
        row({ id: 1, status: "new", last_activity_at: "2026-06-01T00:00:00.000Z" }), // 12 days
        row({ id: 2, status: "answered", last_activity_at: "2026-06-05T00:00:00.000Z" }), // 8 days
        row({ id: 3, status: "clarifying", last_activity_at: "2026-05-20T00:00:00.000Z" }), // 24 days
      ],
      NOW,
    );
    expect(s.aged.map((a) => a.id)).toEqual([3, 1, 2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/domain/stats.test.ts`
Expected: FAIL — `buildDashboardStats is not a function` / `StatsRow` export yok.

- [ ] **Step 3: Write minimal implementation**

`src/domain/stats.ts`'e ekle (mevcut içeriğin altına):

```ts
export type StatsRow = {
  id: number;
  request_no: string;
  title: string;
  status: RequestStatus;
  priority: string;
  created_at: string;
  last_activity_at: string;
};

export type AgedItem = {
  id: number;
  request_no: string;
  title: string;
  status: RequestStatus;
  age_days: number;
};

export type Priority = "low" | "medium" | "high";

export type DashboardStats = {
  total: number;
  open: number;
  agedCount: number;
  byStatus: Record<RequestStatus, number>;
  openByPriority: Record<Priority, number>;
  aged: AgedItem[];
};

const PRIORITIES: readonly Priority[] = ["low", "medium", "high"];

function isPriority(p: string): p is Priority {
  return (PRIORITIES as readonly string[]).includes(p);
}

export function buildDashboardStats(rows: StatsRow[], nowIso: string): DashboardStats {
  const byStatus: Record<RequestStatus, number> = {
    new: 0, clarifying: 0, answered: 0, accepted: 0, rejected: 0,
  };
  const openByPriority: Record<Priority, number> = { low: 0, medium: 0, high: 0 };
  const aged: AgedItem[] = [];

  for (const r of rows) {
    byStatus[r.status]++;
    if (isTerminal(r.status)) continue;
    if (isPriority(r.priority)) openByPriority[r.priority]++;
    const age = ageInDays(r.last_activity_at, nowIso);
    if (age >= AGED_THRESHOLD_DAYS) {
      aged.push({ id: r.id, request_no: r.request_no, title: r.title, status: r.status, age_days: age });
    }
  }

  aged.sort((a, b) => b.age_days - a.age_days);
  const open = byStatus.new + byStatus.clarifying + byStatus.answered;
  return { total: rows.length, open, agedCount: aged.length, byStatus, openByPriority, aged };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/domain/stats.test.ts`
Expected: PASS (tüm testler).

- [ ] **Step 5: Commit**

```bash
git add src/domain/stats.ts src/domain/stats.test.ts
git commit -m "feat(domain): buildDashboardStats aggregation"
```

---

## Task 3: Backend — `listForStats` repo metodu + `GET /api/admin/stats`

**Files:**
- Modify: `src/db/repo.ts`
- Modify: `src/server/routes/admin.ts`
- Test: `src/server/routes/admin.test.ts`

- [ ] **Step 1: Write the failing integration test**

`src/server/routes/admin.test.ts`'e, mevcut `describe("GET /api/admin/requests", ...)` bloğunun **hemen üstüne** ekle. (Dosyadaki yardımcılar: `adminCookie`, `userCookie`, `seedRequest`, `repo`, `handler` zaten mevcut. `repo.addMessageAndTransition(id, {role, body}, status, createdAt)` mesaj ekleyip son aktiviteyi ilerletir.)

```ts
// ─── GET /api/admin/stats ─────────────────────────────────────────────────────

describe("GET /api/admin/stats", () => {
  test("non-admin → 403", async () => {
    const res = await handler(new Request("http://x/api/admin/stats", {
      headers: { cookie: userCookie() },
    }));
    expect(res.status).toBe(403);
  });

  test("admin → 200 with status/priority breakdown and aged list", async () => {
    // r1: new, created long ago, no messages → last_activity = created_at (aged)
    const r1 = repo.createRequest(
      { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "Eski talep", description: "x",
        expected_benefit: "y", priority: "high" },
      "2026-01-01T00:00:00.000Z",
    );
    // r2: fresh new today (deps.now is 2026-01-01 in this suite) → not aged
    repo.createRequest(
      { requester_name: "B", requester_email: "b@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "bug", title: "Yeni talep", description: "x",
        expected_benefit: "y", priority: "medium" },
      "2026-01-01T00:00:00.000Z",
    );

    const res = await handler(new Request("http://x/api/admin/stats", {
      headers: { cookie: adminCookie() },
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.total).toBe(2);
    expect(body.open).toBe(2);
    expect(body.byStatus.new).toBe(2);
    expect(body.openByPriority).toEqual({ low: 0, medium: 1, high: 1 });
    // r1 created 2026-01-01, now 2026-01-01 → age 0; r2 same. Neither aged here.
    expect(body.agedCount).toBe(0);
    expect(Array.isArray(body.aged)).toBe(true);
  });

  test("last_activity follows latest message, not created_at", async () => {
    // created old, but a recent message keeps it fresh → not aged.
    const r = repo.createRequest(
      { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "Hareketli", description: "x",
        expected_benefit: "y", priority: "low" },
      "2025-01-01T00:00:00.000Z",
    );
    repo.addMessageAndTransition(r.id, { role: "admin", body: "Soru?" }, "clarifying", "2026-01-01T00:00:00.000Z");

    const res = await handler(new Request("http://x/api/admin/stats", {
      headers: { cookie: adminCookie() },
    }));
    const body = await res.json() as any;
    // now (2026-01-01) - last message (2026-01-01) = 0 days → not aged,
    // even though created 1 year earlier.
    expect(body.agedCount).toBe(0);
    expect(body.byStatus.clarifying).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/routes/admin.test.ts`
Expected: FAIL — `/api/admin/stats` route yok (404 döner, 200/403 beklentileri patlar) ve `repo.listForStats` tanımsız.

- [ ] **Step 3a: Add `listForStats` to repo**

`src/db/repo.ts`:

İmport satırına `StatsRow` tipini ekle (mevcut domain import'larının yanına):

```ts
import type { StatsRow } from "../domain/stats";
```

`listAll(...)` metodunun **hemen ardına** yeni metot ekle:

```ts
    /** Every request with its last-activity timestamp (latest message, else created_at). */
    listForStats(): StatsRow[] {
      return db
        .query<StatsRow, []>(
          `SELECT r.id, r.request_no, r.title, r.status, r.priority, r.created_at,
                  COALESCE(MAX(m.created_at), r.created_at) AS last_activity_at
           FROM requests r
           LEFT JOIN messages m ON m.request_id = r.id
           GROUP BY r.id
           ORDER BY r.id DESC`,
        )
        .all();
    },
```

- [ ] **Step 3b: Add the route**

`src/server/routes/admin.ts`:

Üstteki import bloğuna ekle (mevcut `../../domain/*` import'larının yanına):

```ts
import { buildDashboardStats } from "../../domain/stats";
```

`handleAdmin` içinde, `// GET /api/admin/requests?status=` bloğunun **hemen ardına** ekle:

```ts
  // GET /api/admin/stats
  if (path === "/api/admin/stats" && method === "GET") {
    if (!user.isAdmin) return json({ error: "Yetkisiz" }, 403, extraHeaders);
    const stats = buildDashboardStats(deps.repo.listForStats(), deps.now());
    return json(stats, 200, extraHeaders);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/server/routes/admin.test.ts`
Expected: PASS (yeni 3 test + mevcutlar yeşil).

- [ ] **Step 5: Commit**

```bash
git add src/db/repo.ts src/server/routes/admin.ts src/server/routes/admin.test.ts
git commit -m "feat(server): GET /api/admin/stats dashboard endpoint"
```

---

## Task 4: Frontend — `Dashboard.tsx` sayfası

**Files:**
- Create: `src/client/pages/Dashboard.tsx`

> Not: İstemci sayfaları (NewRequest/Admin/Definitions) projede birim test edilmiyor; bu sayfa Task 6'daki `bun run build` ile tip/derleme açısından doğrulanır.

- [ ] **Step 1: Create the page**

`src/client/pages/Dashboard.tsx`:

```tsx
// src/client/pages/Dashboard.tsx
// Admin-only özet paneli: sağlık sayıları + durum/öncelik kırılımı + yaşlanan triyaj.
import { useState, useEffect } from "react";
import { Navigate, Link } from "react-router-dom";
import { apiGet } from "../api";
import { useUser } from "../auth";
import { statusLabelTr, type RequestStatus } from "../../domain/status";
import { PRIORITY_LABEL } from "../labels";
import { StatusBadge } from "../components/StatusBadge";

type Priority = "low" | "medium" | "high";

type AgedItem = {
  id: number;
  request_no: string;
  title: string;
  status: RequestStatus;
  age_days: number;
};

type DashboardStats = {
  total: number;
  open: number;
  agedCount: number;
  byStatus: Record<RequestStatus, number>;
  openByPriority: Record<Priority, number>;
  aged: AgedItem[];
};

const STATUS_ORDER: RequestStatus[] = ["new", "clarifying", "answered", "accepted", "rejected"];
const STATUS_BAR: Record<RequestStatus, string> = {
  new: "bg-status-yeni",
  clarifying: "bg-status-netlestiriliyor",
  answered: "bg-status-netlestiriliyor",
  accepted: "bg-status-kabul",
  rejected: "bg-status-ret",
};

const PRIORITY_ORDER: Priority[] = ["high", "medium", "low"];
const PRIORITY_BAR: Record<Priority, string> = {
  high: "bg-danger",
  medium: "bg-status-netlestiriliyor",
  low: "bg-on-surface-variant",
};

function Spinner() {
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

function NumCard({ n, label, alert = false }: { n: number; label: string; alert?: boolean }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-white px-4 py-3">
      <div className={`text-2xl font-bold leading-none ${alert ? "text-danger" : "text-on-surface"}`}>
        {n}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-on-surface-variant">{label}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border-subtle bg-white p-4">
      <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="my-1.5 flex items-center gap-3">
      <span className="w-32 shrink-0 text-sm text-on-surface">{label}</span>
      <span className="h-3.5 flex-1 overflow-hidden rounded bg-surface-container">
        <span className={`block h-full rounded ${color}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="w-7 text-right text-sm font-semibold tabular-nums text-on-surface">{value}</span>
    </div>
  );
}

export function Dashboard() {
  const user = useUser();
  if (!user.isAdmin) return <Navigate to="/my" replace />;
  return <DashboardInner />;
}

function DashboardInner() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<DashboardStats>("/api/admin/stats")
      .then((d) => { if (!cancelled) setStats(d); })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Bir hata oluştu.");
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-on-surface">Özet</h1>

      {error && (
        <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {!stats && !error && <Spinner />}

      {stats && (
        <>
          <div className="mb-6 grid grid-cols-3 gap-3">
            <NumCard n={stats.total} label="Toplam" />
            <NumCard n={stats.open} label="Açık" />
            <NumCard n={stats.agedCount} label="7g+ Bekleyen" alert />
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <Panel title="Durum dağılımı">
              {STATUS_ORDER.map((s) => (
                <Bar
                  key={s}
                  label={statusLabelTr(s)}
                  value={stats.byStatus[s]}
                  max={Math.max(1, ...STATUS_ORDER.map((x) => stats.byStatus[x]))}
                  color={STATUS_BAR[s]}
                />
              ))}
            </Panel>
            <Panel title="Öncelik (açık talepler)">
              {PRIORITY_ORDER.map((p) => (
                <Bar
                  key={p}
                  label={PRIORITY_LABEL[p]}
                  value={stats.openByPriority[p]}
                  max={Math.max(1, ...PRIORITY_ORDER.map((x) => stats.openByPriority[x]))}
                  color={PRIORITY_BAR[p]}
                />
              ))}
            </Panel>
          </div>

          <Panel title="Dikkat bekleyen (7+ gün hareketsiz)">
            {stats.aged.length === 0 ? (
              <p className="py-2 text-sm text-on-surface-variant">Bekleyen yok.</p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {stats.aged.map((a) => (
                  <li key={a.id}>
                    <Link
                      to={`/admin/requests/${a.id}`}
                      className="flex items-center gap-3 rounded px-1 py-2 hover:bg-surface-container"
                    >
                      <span className="w-20 shrink-0 font-semibold text-primary">{a.request_no}</span>
                      <span className="flex-1 truncate text-sm text-on-surface">{a.title}</span>
                      <StatusBadge status={a.status} />
                      <span className="whitespace-nowrap text-sm font-semibold text-danger">
                        {a.age_days}g
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/pages/Dashboard.tsx
git commit -m "feat(client): admin dashboard page"
```

---

## Task 5: Routing + sidebar — `/admin` = Dashboard, liste → `/admin/talepler`

**Files:**
- Modify: `src/client/app.tsx`
- Modify: `src/client/layouts/AdminLayout.tsx`

- [ ] **Step 1: Wire the routes**

`src/client/app.tsx`:

`const Admin = lazy(...)` tanımının **hemen ardına** Dashboard lazy import'unu ekle:

```ts
const Dashboard = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })),
);
```

`AdminLayout` rota bloğunda `/admin` ve liste satırlarını şu hale getir:

Mevcut:

```tsx
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/tanimlar" element={<Definitions />} />
            <Route path="/admin/requests/:id" element={<RequestDetailAdmin />} />
          </Route>
```

Yeni:

```tsx
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<Dashboard />} />
            <Route path="/admin/talepler" element={<Admin />} />
            <Route path="/admin/tanimlar" element={<Definitions />} />
            <Route path="/admin/requests/:id" element={<RequestDetailAdmin />} />
          </Route>
```

> `Home` (app.tsx:39) admin'i `/admin`'e yönlendirir — artık Dashboard'a düşer, doğru. `EmployeeLayout`'taki "Yönetim →" linki de `/admin` (Dashboard); istenen davranış.

- [ ] **Step 2: Update the sidebar**

`src/client/layouts/AdminLayout.tsx`:

Mevcut nav linklerini:

```tsx
          <NavLink to="/admin" end className={sideLink}>
            Tüm Talepler
          </NavLink>
          <NavLink to="/admin/tanimlar" className={sideLink}>
            Tanımlar
          </NavLink>
```

şununla değiştir:

```tsx
          <NavLink to="/admin" end className={sideLink}>
            Özet
          </NavLink>
          <NavLink to="/admin/talepler" className={sideLink}>
            Tüm Talepler
          </NavLink>
          <NavLink to="/admin/tanimlar" className={sideLink}>
            Tanımlar
          </NavLink>
```

- [ ] **Step 3: Commit**

```bash
git add src/client/app.tsx src/client/layouts/AdminLayout.tsx
git commit -m "feat(client): dashboard as admin landing; move list to /admin/talepler"
```

---

## Task 6: Doğrulama — tam test + build

**Files:** (yok — yalnız doğrulama)

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: PASS — tüm testler yeşil (önceki ~232 + yeni domain & stats testleri).

- [ ] **Step 2: Build the client bundle**

Run: `bun run build`
Expected: Hatasız tamamlanır (Dashboard.tsx tip/derleme hatası yok, yeni chunk üretilir).

- [ ] **Step 3: Final commit (gerekiyorsa)**

Build çıktısı `public/` içinde versiyonlanmıyorsa adım atlanır. Repo temizse:

```bash
git status --short
```

Beklenen: temiz (önceki task'larda commit edildi).

---

## Self-Review Notes

- **Spec §3 (yaş tanımı):** Task 1 `ageInDays` + `AGED_THRESHOLD_DAYS`; Task 2 `>= 7` sınır testi; Task 3 `listForStats` SQL'i `COALESCE(MAX(m.created_at), r.created_at)` ile son-hareket. ✓
- **Spec §4 (içerik/düzen B):** Task 4 sayı kartları + iki sütun çubuk + triyaj. ✓
- **Spec §5 (mimari/katmanlama):** domain saf (Task 1-2), repo ham satır (Task 3a), route ince (Task 3b), istemci fetch-only (Task 4). ✓
- **Spec §6 (veri şekli):** `total/open/agedCount/byStatus/openByPriority/aged` — Task 2 tip + Task 3 entegrasyon testi alanları doğrular. ✓
- **Spec §7 (sınır durumları):** boş DB (Task 2 test), mesajsız talep `created_at` (Task 3 test), tam 7 gün dahil (Task 2 test), terminal hariç (Task 2 test). ✓
- **Spec §8 (test):** domain exhaustive (Task 1-2), server 403+200 (Task 3). ✓
- **Tip tutarlılığı:** `StatsRow`/`DashboardStats`/`Priority` domain'de tanımlı; repo ve istemci aynı alan adlarını kullanır (`last_activity_at`, `age_days`, `openByPriority`). İstemcideki `DashboardStats` tipi domain'inkini birebir yansıtır (istemci domain tipini import etmiyor — mevcut desen; alanlar elle eşleşir). ✓
- **Import doğruluğu:** `buildDashboardStats` `../../domain/stats`'ten gelir (Task 3b); repo `StatsRow`'u `../domain/stats`'ten import eder (Task 3a). ✓
```
