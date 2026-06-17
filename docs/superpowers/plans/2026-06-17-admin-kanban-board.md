# Admin Kanban Panosu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin'e salt-görsel bir Kanban panosu eklemek — aktif talepler 5 durum sütununda (`Yeni`/`Netleştiriliyor`/`Cevaplandı`/`Kabul edildi`/`Yapılıyor`) gösterilir, kart tıklanınca detaya gidilir.

**Architecture:** Saf gruplama/sıralama mantığı `src/client/board.ts`'te izole edilir (DOM'suz birim testi). `src/client/pages/Board.tsx` veriyi mevcut `GET /api/admin/requests` endpoint'inden çeker, `groupForBoard` ile sütunlara böler, `RequestCard`'ı yeniden kullanır. Yeni rota `/admin/pano` + sidebar linki. Backend değişmez.

**Tech Stack:** React 19 + react-router-dom + Tailwind, Bun, `bun test` (`renderToStaticMarkup` ile bileşen testi, saf mantık için DOM'suz birim testi).

---

## File Structure

- **Create** `src/client/board.ts` — saf: `BOARD_COLUMNS`, `PRIORITY_RANK`, `groupForBoard`. Zero React/DOM (type-only importlar).
- **Create** `src/client/board.test.ts` — `groupForBoard`/`BOARD_COLUMNS` birim testleri.
- **Modify** `src/client/components/RequestCard.tsx` — opsiyonel `showStatus` prop.
- **Create** `src/client/components/RequestCard.test.tsx` — `showStatus` davranışı (MemoryRouter + renderToStaticMarkup).
- **Create** `src/client/pages/Board.tsx` — admin Kanban sayfası.
- **Modify** `src/client/app.tsx` — `Board` lazy import + `/admin/pano` rotası.
- **Modify** `src/client/layouts/AdminLayout.tsx` — sidebar'a "Pano" linki.

---

## Task 1: Saf pano mantığı (`board.ts`)

**Files:**
- Create: `src/client/board.ts`
- Test: `src/client/board.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

`src/client/board.test.ts` oluştur:

```typescript
import { expect, test, describe } from "bun:test";
import { BOARD_COLUMNS, groupForBoard } from "./board";
import type { RequestRow } from "./components/RequestCard";

function row(over: Partial<RequestRow> & { id: number }): RequestRow {
  return {
    request_no: `T-${over.id}`,
    created_at: "2026-06-01T00:00:00.000Z",
    requester_name: "A",
    requester_email: "a@k.com",
    department: "d",
    application: "ERP",
    module_area: "",
    request_type: "feature",
    title: "t",
    description: "d",
    expected_benefit: "b",
    priority: "medium",
    status: "new",
    ...over,
  };
}

describe("BOARD_COLUMNS", () => {
  test("is exactly the 5 active statuses in workflow order", () => {
    expect(BOARD_COLUMNS).toEqual([
      "new", "clarifying", "answered", "accepted", "in_progress",
    ]);
  });
  test("contains no terminal status", () => {
    for (const t of ["done", "rejected", "cancelled"]) {
      expect(BOARD_COLUMNS).not.toContain(t);
    }
  });
});

describe("groupForBoard", () => {
  test("returns one bucket per column, aligned to BOARD_COLUMNS", () => {
    const cols = groupForBoard([]);
    expect(cols.length).toBe(BOARD_COLUMNS.length);
    expect(cols.every((c) => c.length === 0)).toBe(true);
  });

  test("places each active row in its status column", () => {
    const rows = [
      row({ id: 1, status: "new" }),
      row({ id: 2, status: "answered" }),
      row({ id: 3, status: "in_progress" }),
    ];
    const cols = groupForBoard(rows);
    expect(cols[0].map((r) => r.id)).toEqual([1]); // new
    expect(cols[2].map((r) => r.id)).toEqual([2]); // answered
    expect(cols[4].map((r) => r.id)).toEqual([3]); // in_progress
  });

  test("drops terminal rows (done/rejected/cancelled)", () => {
    const rows = [
      row({ id: 1, status: "new" }),
      row({ id: 2, status: "done" }),
      row({ id: 3, status: "rejected" }),
      row({ id: 4, status: "cancelled" }),
    ];
    const cols = groupForBoard(rows);
    const total = cols.reduce((n, c) => n + c.length, 0);
    expect(total).toBe(1);
    expect(cols[0].map((r) => r.id)).toEqual([1]);
  });

  test("sorts a column by priority (high first), then oldest activity first", () => {
    const rows = [
      row({ id: 1, status: "new", priority: "low",  last_activity_at: "2026-06-02T00:00:00.000Z" }),
      row({ id: 2, status: "new", priority: "high", last_activity_at: "2026-06-05T00:00:00.000Z" }),
      row({ id: 3, status: "new", priority: "high", last_activity_at: "2026-06-03T00:00:00.000Z" }),
    ];
    const cols = groupForBoard(rows);
    // high(oldest)=3, high(newer)=2, then low=1
    expect(cols[0].map((r) => r.id)).toEqual([3, 2, 1]);
  });

  test("falls back to created_at when last_activity_at is absent", () => {
    const rows = [
      row({ id: 1, status: "new", priority: "high", created_at: "2026-06-09T00:00:00.000Z", last_activity_at: undefined }),
      row({ id: 2, status: "new", priority: "high", created_at: "2026-06-01T00:00:00.000Z", last_activity_at: undefined }),
    ];
    const cols = groupForBoard(rows);
    expect(cols[0].map((r) => r.id)).toEqual([2, 1]); // older created_at first
  });
});
```

- [ ] **Step 2: Testi koştur, başarısız olduğunu gör**

Run: `bun test src/client/board.test.ts`
Expected: FAIL — `./board` modülü yok.

- [ ] **Step 3: `src/client/board.ts`'i yaz**

```typescript
// src/client/board.ts
// Pure grouping/sorting logic for the admin Kanban board.
// Kept free of React/DOM imports (type-only) so it unit-tests without a DOM.
import { type RequestStatus } from "../domain/status";
import type { RequestRow } from "./components/RequestCard";

/** Active (non-terminal) statuses shown as board columns, in workflow order. */
export const BOARD_COLUMNS: RequestStatus[] = [
  "new",
  "clarifying",
  "answered",
  "accepted",
  "in_progress",
];

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function activityKey(r: RequestRow): string {
  return r.last_activity_at ?? r.created_at;
}

/** priority (high→low), then oldest activity first (stale surfaces to top). */
function boardSort(a: RequestRow, b: RequestRow): number {
  const pa = PRIORITY_RANK[a.priority] ?? 3;
  const pb = PRIORITY_RANK[b.priority] ?? 3;
  if (pa !== pb) return pa - pb;
  return activityKey(a).localeCompare(activityKey(b));
}

/**
 * Group rows into one sorted bucket per BOARD_COLUMNS entry (index-aligned).
 * Terminal/unknown statuses are dropped.
 */
export function groupForBoard(rows: RequestRow[]): RequestRow[][] {
  return BOARD_COLUMNS.map((status) =>
    rows.filter((r) => r.status === status).sort(boardSort),
  );
}
```

- [ ] **Step 4: Testi koştur, geçtiğini gör**

Run: `bun test src/client/board.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/board.ts src/client/board.test.ts
git commit -m "feat(client): pure board grouping/sorting logic"
```

---

## Task 2: RequestCard `showStatus` prop

**Files:**
- Modify: `src/client/components/RequestCard.tsx`
- Test: `src/client/components/RequestCard.test.tsx`

- [ ] **Step 1: Başarısız testi yaz**

`src/client/components/RequestCard.test.tsx` oluştur (RequestCard bir `<Link>` içerdiği için `MemoryRouter` ile sar):

```tsx
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { RequestCard, type RequestRow } from "./RequestCard";

const row: RequestRow = {
  id: 1,
  request_no: "TALEP-0001",
  created_at: "2026-06-10T00:00:00.000Z",
  requester_name: "A",
  requester_email: "a@k.com",
  department: "d",
  application: "ERP",
  module_area: "",
  request_type: "feature",
  title: "Başlık",
  description: "d",
  expected_benefit: "b",
  priority: "high",
  status: "accepted",
};

test("RequestCard shows status badge by default", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter><RequestCard r={row} /></MemoryRouter>,
  );
  expect(html).toContain("Kabul edildi");
});

test("RequestCard hides status badge when showStatus=false", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter><RequestCard r={row} showStatus={false} /></MemoryRouter>,
  );
  expect(html).not.toContain("Kabul edildi");
});
```

- [ ] **Step 2: Testi koştur, başarısız olduğunu gör**

Run: `bun test src/client/components/RequestCard.test.tsx`
Expected: FAIL — `showStatus` prop'u yok; ikinci test başarısız (rozet hep render edilir) ve/veya TS prop hatası.

- [ ] **Step 3: RequestCard'a prop ekle**

`src/client/components/RequestCard.tsx`'te fonksiyon imzasını değiştir:

```tsx
export function RequestCard({
  r,
  basePath = "/requests",
  showStatus = true,
}: {
  r: RequestRow;
  basePath?: string;
  showStatus?: boolean;
}) {
```

Ve üst satırdaki rozet render'ını koşullu yap — şu satırı:

```tsx
        <StatusBadge status={r.status} />
```

şununla değiştir:

```tsx
        {showStatus && <StatusBadge status={r.status} />}
```

Başka bir şey değişmez.

- [ ] **Step 4: Testi koştur, geçtiğini gör**

Run: `bun test src/client/components/RequestCard.test.tsx`
Expected: PASS (2 test)

- [ ] **Step 5: Commit**

```bash
git add src/client/components/RequestCard.tsx src/client/components/RequestCard.test.tsx
git commit -m "feat(client): optional showStatus prop on RequestCard"
```

---

## Task 3: Board sayfası

**Files:**
- Create: `src/client/pages/Board.tsx`

> Not: Sayfa bileşeni (apiGet/useUser hook'ları) için birim testi yazılmaz — mevcut `Dashboard.tsx`/`Admin.tsx` deseninde de yok. Davranış Task 1'in saf testleriyle + Task 5'teki build/manuel kontrolle doğrulanır.

- [ ] **Step 1: `src/client/pages/Board.tsx`'i yaz**

```tsx
// src/client/pages/Board.tsx
// Admin-only Kanban board: active requests grouped into status columns (read-only).
import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { apiGet } from "../api";
import { useUser } from "../auth";
import { statusLabelTr } from "../../domain/status";
import { RequestCard, type RequestRow } from "../components/RequestCard";
import { Spinner } from "../components/Spinner";
import { BOARD_COLUMNS, groupForBoard } from "../board";

export function Board() {
  const user = useUser();
  if (!user.isAdmin) return <Navigate to="/my" replace />;
  return <BoardInner />;
}

function BoardInner() {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<RequestRow[]>("/api/admin/requests")
      .then((d) => { if (!cancelled) setRows(d); })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Bir hata oluştu.");
      });
    return () => { cancelled = true; };
  }, []);

  const columns = rows ? groupForBoard(rows) : null;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-on-surface">Pano</h1>

      {error && (
        <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {!rows && !error && <Spinner />}

      {columns && (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {BOARD_COLUMNS.map((status, i) => (
            <section key={status} className="w-72 shrink-0">
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-on-surface">
                  {statusLabelTr(status)}
                </h2>
                <span className="rounded-full bg-surface-container px-2 py-0.5 text-xs font-medium tabular-nums text-on-surface-variant">
                  {columns[i].length}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {columns[i].length === 0 ? (
                  <p className="px-1 py-6 text-center text-sm text-on-surface-variant/70">—</p>
                ) : (
                  columns[i].map((r) => (
                    <RequestCard key={r.id} r={r} basePath="/admin/requests" showStatus={false} />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Doğrula (import/derleme)**

Run: `bun test src/client/board.test.ts`
Expected: PASS (board.ts hâlâ yeşil; Board.tsx Task 4'te route'a bağlanınca build'de derlenecek — bu adımda yalnız board mantığının bozulmadığını teyit ediyoruz).

- [ ] **Step 3: Commit**

```bash
git add src/client/pages/Board.tsx
git commit -m "feat(client): admin Kanban board page"
```

---

## Task 4: Rota + sidebar linki

**Files:**
- Modify: `src/client/app.tsx`
- Modify: `src/client/layouts/AdminLayout.tsx`

- [ ] **Step 1: app.tsx — lazy import ekle**

`src/client/app.tsx`'te diğer `lazy(...)` tanımlarının yanına (ör. `Dashboard` tanımından sonra) ekle:

```tsx
const Board = lazy(() =>
  import("./pages/Board").then((m) => ({ default: m.Board })),
);
```

- [ ] **Step 2: app.tsx — rota ekle**

`AdminLayout` route grubunda, `/admin/talepler` satırının hemen ardına ekle:

```tsx
            <Route path="/admin/pano" element={<Board />} />
```

(Sonuç sırası: `/admin`, `/admin/talepler`, `/admin/pano`, `/admin/tanimlar`, `/admin/requests/:id`.)

- [ ] **Step 3: AdminLayout — sidebar linki ekle**

`src/client/layouts/AdminLayout.tsx`'te "Tüm Talepler" `NavLink`'inin hemen ardına ekle:

```tsx
          <NavLink to="/admin/pano" className={sideLink}>
            Pano
          </NavLink>
```

- [ ] **Step 4: Commit**

```bash
git add src/client/app.tsx src/client/layouts/AdminLayout.tsx
git commit -m "feat(client): wire /admin/pano route + sidebar link"
```

---

## Task 5: Gate + build + manuel doğrulama

**Files:** —

- [ ] **Step 1: Tüm testler**

Run: `bun test`
Expected: PASS (tüm paket yeşil; yeni `board.test.ts` ve `RequestCard.test.tsx` dahil).

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: Hata yok; `Board` chunk'ı bundle'lanır (`public/` güncellenir).

- [ ] **Step 3: Manuel akış**

Run: `bun run dev` → admin olarak `/admin/pano`:
1. Sidebar'da "Pano" linki görünür ve aktif vurguyu alır.
2. 5 sütun: Yeni / Netleştiriliyor / Cevaplandı / Kabul edildi / Yapılıyor; her başlıkta sayı rozeti.
3. Terminal talepler (Tamamlandı/Reddedildi/İptal edildi) panoda **görünmez**.
4. Kart rozet göstermez (sütun başlığı zaten durumu söyler); karta tıklayınca `/admin/requests/:id` açılır.
5. Boş sütun "—" gösterir; sütun içi yüksek öncelik üstte.
6. Dar pencerede yatay kaydırma çalışır.

Beklenen: davranış yukarıdaki gibi.

---

## Self-Review Notları

- **Spec kapsamı:** salt-görsel pano (Task 3), 5 aktif sütun + terminal gizleme (Task 1 `BOARD_COLUMNS`/`groupForBoard`), sayı rozeti + boş yer tutucu (Task 3), sıralama (Task 1), `/admin/pano` rota + sidebar (Task 4), veri akışı filtresiz `/api/admin/requests` + istemci grupla (Task 3), `RequestCard.showStatus` (Task 2), izole saf mantık + testler (Task 1, 2) — hepsi kapsanıyor.
- **Tip tutarlılığı:** `BOARD_COLUMNS`/`groupForBoard` (Task 1) ↔ Board.tsx tüketimi (Task 3) hizalı; `showStatus` (Task 2) ↔ Board kullanımı (Task 3) tutarlı; `Board` named export (Task 3) ↔ lazy adapter (Task 4) eşleşiyor.
- **Placeholder yok:** tüm adımlar gerçek kod içerir.
- **Test-env güvenliği:** `board.ts` yalnız type-only import yapar (RequestRow/RequestStatus erase edilir) → DOM/React/prosemirror çekmez, `board.test.ts` DOM'suz koşar. `RequestCard.test.tsx` `MemoryRouter` ile sarar (Link router context ister).
