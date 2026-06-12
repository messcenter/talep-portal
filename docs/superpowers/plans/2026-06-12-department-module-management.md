# Departman & Modül Yönetimi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Admin'in departman ve (departmana bağlı) modül listelerini yönetmesini, Yeni Talep formunun bu listelerden katı seçim yaptırmasını sağlamak.

**Architecture:** 2 yeni tablo (`departments`, `modules`); repo CRUD; `GET /api/departments` + admin CRUD handler'ları; talep oluşturmada DB'ye karşı katılık kontrolü (route'da, domain zero-I/O korunur); yeni admin "Tanımlar" sayfası + NewRequest form'unda departman/modül select'leri. Talep satırı text snapshot olarak saklamaya devam eder (şema değişmez).

**Tech Stack:** Bun.serve, bun:sqlite, React 19 SPA, shadcn, Zod.

---

## Korunan / Değişen
- `requests` şeması **değişmez** (department/module_area TEXT snapshot).
- Yeni: `departments`, `modules` tabloları; repo metotları; `src/server/routes/definitions.ts`; `src/client/pages/Definitions.tsx`; NewRequest select'leri.
- Değişen: `src/db/db.ts` (migrate), `src/db/repo.ts` (metotlar), `src/server/handler.ts` (dispatch), `src/server/routes/requests.ts` (katılık), `src/client/app.tsx` (route + nav), `src/client/pages/NewRequest.tsx` (select'ler).

---

## Task 1: DB tabloları + repo CRUD

**Files:**
- Modify: `src/db/db.ts` (migrate'e 2 tablo)
- Modify: `src/db/repo.ts` (tipler + metotlar)
- Test: `src/db/repo.test.ts` (yeni testler ekle)

- [ ] **Step 1: migrate'e tabloları ekle**

`src/db/db.ts` `migrate()` içindeki template literal'in SONUNA (attachments index'lerinden sonra, kapanış backtick'ten önce) ekle:
```sql
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(department_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_modules_department ON modules(department_id);
```

- [ ] **Step 2: Başarısız repo testlerini yaz**

`src/db/repo.test.ts` içinde mevcut `schema(db)` helper'ı bu yeni tabloları içermeli. Önce o test dosyasının kendi `schema()`'sını AÇ ve aynı iki `CREATE TABLE` (departments, modules) ifadesini oraya da ekle (test in-memory DB kendi şemasını kuruyor). Sonra yeni testler ekle:
```ts
test("departments + modules CRUD with cascade", () => {
  const d1 = repo.createDepartment("Üretim", "2026-01-01T00:00:00Z");
  const d2 = repo.createDepartment("Muhasebe", "2026-01-01T00:00:00Z");
  expect(d1.id).toBeGreaterThan(0);
  const m1 = repo.createModule(d1.id, "Stok", "2026-01-01T00:00:00Z");
  repo.createModule(d1.id, "Planlama", "2026-01-01T00:00:00Z");

  const list = repo.listDepartmentsWithModules();
  const uretim = list.find((d) => d.name === "Üretim")!;
  expect(uretim.modules.map((m) => m.name).sort()).toEqual(["Planlama", "Stok"]);
  expect(list.find((d) => d.name === "Muhasebe")!.modules).toEqual([]);

  expect(repo.getDepartmentByName("Üretim")?.id).toBe(d1.id);
  expect(repo.getDepartmentByName("Yok")).toBeNull();
  expect(repo.listModuleNames(d1.id).sort()).toEqual(["Planlama", "Stok"]);

  // cascade: deleting the department removes its modules
  repo.deleteDepartment(d1.id);
  expect(repo.getDepartmentByName("Üretim")).toBeNull();
  expect(repo.listModuleNames(d1.id)).toEqual([]);

  repo.deleteModule(m1.id); // already gone via cascade; no throw
  void d2;
});

test("duplicate department name throws", () => {
  repo.createDepartment("İK", "2026-01-01T00:00:00Z");
  expect(() => repo.createDepartment("İK", "2026-01-01T00:00:00Z")).toThrow();
});

test("duplicate module within a department throws", () => {
  const d = repo.createDepartment("Satış", "2026-01-01T00:00:00Z");
  repo.createModule(d.id, "CRM", "2026-01-01T00:00:00Z");
  expect(() => repo.createModule(d.id, "CRM", "2026-01-01T00:00:00Z")).toThrow();
});
```
NOT: repo.test.ts'in in-memory DB'sinde `PRAGMA foreign_keys = ON` ayarlı mı kontrol et; değilse cascade çalışmaz. Test setup'ında `db.exec("PRAGMA foreign_keys = ON;")` olduğundan emin ol (yoksa ekle).

- [ ] **Step 3: Testi çalıştır, başarısız olduğunu doğrula**

Run: `bun test src/db/repo.test.ts`
Expected: FAIL — `repo.createDepartment is not a function`.

- [ ] **Step 4: repo metotlarını + tipleri ekle**

`src/db/repo.ts`'te export tiplere ekle:
```ts
export type Department = { id: number; name: string; created_at: string };
export type ModuleRow = { id: number; department_id: number; name: string; created_at: string };
export type DepartmentWithModules = { id: number; name: string; modules: { id: number; name: string }[] };
```
`makeRepo` return objesine (mevcut metotların yanına) ekle:
```ts
    createDepartment(name: string, createdAt: string): Department {
      const row = db.query(
        `INSERT INTO departments (name, created_at) VALUES (?, ?) RETURNING *`,
      ).get(name, createdAt) as Department;
      return row;
    },
    deleteDepartment(id: number): void {
      db.query(`DELETE FROM departments WHERE id = ?`).run(id);
    },
    getDepartmentByName(name: string): Department | null {
      return (db.query(`SELECT * FROM departments WHERE name = ?`).get(name) as Department) ?? null;
    },
    createModule(departmentId: number, name: string, createdAt: string): ModuleRow {
      const row = db.query(
        `INSERT INTO modules (department_id, name, created_at) VALUES (?, ?, ?) RETURNING *`,
      ).get(departmentId, name, createdAt) as ModuleRow;
      return row;
    },
    deleteModule(id: number): void {
      db.query(`DELETE FROM modules WHERE id = ?`).run(id);
    },
    getDepartment(id: number): Department | null {
      return (db.query(`SELECT * FROM departments WHERE id = ?`).get(id) as Department) ?? null;
    },
    listModuleNames(departmentId: number): string[] {
      return (db.query(`SELECT name FROM modules WHERE department_id = ? ORDER BY name`)
        .all(departmentId) as { name: string }[]).map((r) => r.name);
    },
    listDepartmentsWithModules(): DepartmentWithModules[] {
      const depts = db.query(`SELECT * FROM departments ORDER BY name`).all() as Department[];
      return depts.map((d) => ({
        id: d.id,
        name: d.name,
        modules: db.query(`SELECT id, name FROM modules WHERE department_id = ? ORDER BY name`)
          .all(d.id) as { id: number; name: string }[],
      }));
    },
```
NOT: `bun:sqlite` `RETURNING *` destekler. UNIQUE ihlali bir SQLite hatası fırlatır (test bunu bekliyor); route katmanı bunu yakalayıp 409'a çevirecek (Task 2).

- [ ] **Step 5: Testi çalıştır, geçtiğini doğrula**

Run: `bun test src/db/repo.test.ts`
Expected: PASS.

- [ ] **Step 6: Tüm testler + commit**

Run: `bun test` → tümü yeşil.
```bash
git add src/db/db.ts src/db/repo.ts src/db/repo.test.ts
git commit -m "feat: department & module tables + repo CRUD"
```

---

## Task 2: API — GET /api/departments + admin CRUD

**Files:**
- Create: `src/server/routes/definitions.ts`
- Modify: `src/server/handler.ts` (dispatch + the /api/departments GET is session-only, not admin)
- Test: `src/server/routes/definitions.test.ts`

Handler context (from existing code): `makeHandler` auth-gates `/api/*` (401), mints csrf, enforces CSRF (403) + size cap on MUTATING (POST/PUT/PATCH/DELETE). It dispatches: `/api/me`, then `handleRequests`, then `handleAdmin`, then 404. Add `handleDefinitions` to the chain. The route functions take `(path, method, req, user, extraHeaders, deps)` and return `Response | null` (see `src/server/routes/requests.ts` for the exact signature/pattern — read it).

- [ ] **Step 1: Başarısız testleri yaz**

Create `src/server/routes/definitions.test.ts` — reuse the harness from `src/server/routes/admin.test.ts` (in-memory sqlite with the FULL schema incl. departments/modules, mem storage, signed session cookies for an admin `boss@kokilmetal.com.tr` and a normal user). Read admin.test.ts to copy the harness; ensure the test schema includes the departments/modules tables. Tests:
```ts
test("GET /api/departments returns depts with modules (any session)", async () => {
  const d = repo.createDepartment("Üretim", deps.now());
  repo.createModule(d.id, "Stok", deps.now());
  const res = await handler(req("GET", "/api/departments", userCookie())); // normal user OK
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body[0].name).toBe("Üretim");
  expect(body[0].modules[0].name).toBe("Stok");
});

test("POST /api/admin/departments as admin → 201; non-admin → 403", async () => {
  const ok = await handler(reqJson("POST", "/api/admin/departments", { name: "Muhasebe" }, adminCookieCsrf()));
  expect(ok.status).toBe(201);
  expect((await ok.json()).id).toBeGreaterThan(0);

  const forbidden = await handler(reqJson("POST", "/api/admin/departments", { name: "X" }, userCookieCsrf()));
  expect(forbidden.status).toBe(403);
});

test("POST /api/admin/departments empty name → 400; duplicate → 409", async () => {
  await handler(reqJson("POST", "/api/admin/departments", { name: "İK" }, adminCookieCsrf()));
  const dup = await handler(reqJson("POST", "/api/admin/departments", { name: "İK" }, adminCookieCsrf()));
  expect(dup.status).toBe(409);
  const empty = await handler(reqJson("POST", "/api/admin/departments", { name: "  " }, adminCookieCsrf()));
  expect(empty.status).toBe(400);
});

test("POST /api/admin/departments without CSRF → 403", async () => {
  const res = await handler(reqJson("POST", "/api/admin/departments", { name: "Z" }, adminCookieNoCsrf()));
  expect(res.status).toBe(403);
});

test("module add: dept missing → 404; duplicate → 409; ok → 201", async () => {
  const d = repo.createDepartment("Satış", deps.now());
  const ok = await handler(reqJson("POST", `/api/admin/departments/${d.id}/modules`, { name: "CRM" }, adminCookieCsrf()));
  expect(ok.status).toBe(201);
  const dup = await handler(reqJson("POST", `/api/admin/departments/${d.id}/modules`, { name: "CRM" }, adminCookieCsrf()));
  expect(dup.status).toBe(409);
  const noDept = await handler(reqJson("POST", `/api/admin/departments/99999/modules`, { name: "Y" }, adminCookieCsrf()));
  expect(noDept.status).toBe(404);
});

test("DELETE department/module as admin → 204; missing → 404", async () => {
  const d = repo.createDepartment("Lojistik", deps.now());
  const m = repo.createModule(d.id, "Sevkiyat", deps.now());
  expect((await handler(req("DELETE", `/api/admin/modules/${m.id}`, adminCookieCsrf()))).status).toBe(204);
  expect((await handler(req("DELETE", `/api/admin/departments/${d.id}`, adminCookieCsrf()))).status).toBe(204);
  expect((await handler(req("DELETE", `/api/admin/departments/99999`, adminCookieCsrf()))).status).toBe(404);
});
```
Adapt the `req`/`reqJson`/cookie helpers to match the harness style in admin.test.ts (e.g. build `new Request(url, {method, headers, body})`; admin cookie + `csrf` cookie + `x-csrf-token` header for mutating). For JSON bodies set `content-type: application/json`.

- [ ] **Step 2: Run, verify FAIL**

Run: `bun test src/server/routes/definitions.test.ts`
Expected: FAIL (handler 404s these paths / module missing).

- [ ] **Step 3: Implement `src/server/routes/definitions.ts`**

```ts
// src/server/routes/definitions.ts — GET /api/departments + admin CRUD for departments/modules.
import type { User } from "../../domain/authz";
import { json } from "../handler";
import type { Deps } from "../handler";

function isUniqueErr(e: unknown): boolean {
  return e instanceof Error && /UNIQUE/i.test(e.message);
}

async function readName(req: Request): Promise<string | null> {
  try {
    const ct = req.headers.get("content-type") ?? "";
    let name: unknown;
    if (ct.includes("application/json")) name = (await req.json())?.name;
    else name = (await req.formData()).get("name");
    if (typeof name !== "string") return null;
    const trimmed = name.trim();
    return trimmed.length ? trimmed : null;
  } catch {
    return null;
  }
}

export async function handleDefinitions(
  path: string,
  method: string,
  req: Request,
  user: User,
  extraHeaders: Record<string, string>,
  deps: Deps,
): Promise<Response | null> {
  // Public-to-any-session: list departments with modules (needed to fill the form).
  if (path === "/api/departments" && method === "GET") {
    return json(deps.repo.listDepartmentsWithModules(), 200, extraHeaders);
  }

  // Everything else here is admin-only.
  if (path.startsWith("/api/admin/departments") || path.startsWith("/api/admin/modules")) {
    if (!user.isAdmin) return json({ error: "forbidden" }, 403, extraHeaders);

    if (path === "/api/admin/departments" && method === "POST") {
      const name = await readName(req);
      if (!name) return json({ errors: ["İsim gerekli"] }, 400, extraHeaders);
      try {
        const d = deps.repo.createDepartment(name, deps.now());
        return json({ id: d.id }, 201, extraHeaders);
      } catch (e) {
        if (isUniqueErr(e)) return json({ error: "Bu departman zaten var" }, 409, extraHeaders);
        throw e;
      }
    }

    let m = path.match(/^\/api\/admin\/departments\/(\d+)$/);
    if (m && method === "DELETE") {
      const id = Number(m[1]);
      if (!deps.repo.getDepartment(id)) return json({ error: "not found" }, 404, extraHeaders);
      deps.repo.deleteDepartment(id);
      return new Response(null, { status: 204, headers: extraHeaders });
    }

    m = path.match(/^\/api\/admin\/departments\/(\d+)\/modules$/);
    if (m && method === "POST") {
      const deptId = Number(m[1]);
      if (!deps.repo.getDepartment(deptId)) return json({ error: "not found" }, 404, extraHeaders);
      const name = await readName(req);
      if (!name) return json({ errors: ["İsim gerekli"] }, 400, extraHeaders);
      try {
        const mod = deps.repo.createModule(deptId, name, deps.now());
        return json({ id: mod.id }, 201, extraHeaders);
      } catch (e) {
        if (isUniqueErr(e)) return json({ error: "Bu modül zaten var" }, 409, extraHeaders);
        throw e;
      }
    }

    m = path.match(/^\/api\/admin\/modules\/(\d+)$/);
    if (m && method === "DELETE") {
      const id = Number(m[1]);
      // No getModule helper; deleting a nonexistent id affects 0 rows. Use changes to detect.
      const existed = deps.repo.listDepartmentsWithModules()
        .some((d) => d.modules.some((mo) => mo.id === id));
      if (!existed) return json({ error: "not found" }, 404, extraHeaders);
      deps.repo.deleteModule(id);
      return new Response(null, { status: 204, headers: extraHeaders });
    }
  }

  return null;
}
```
NOT: `getDepartment` Task 1'de eklendi. Modül silmede 404 için var-mı kontrolü `listDepartmentsWithModules` üzerinden yapılıyor (basit; modül sayısı küçük). İstersen Task 1'e `getModule(id)` ekleyip burada kullan — ama mevcut haliyle yeterli.

- [ ] **Step 4: handler'a dispatch ekle**

`src/server/handler.ts`'te, `handleAdmin` çağrısının yanına (read the file for the exact dispatch block) `handleDefinitions`'ı ekle. Sıra: requests → admin → definitions → 404. Import et:
```ts
import { handleDefinitions } from "./routes/definitions";
```
Dispatch (mevcut desene uygun):
```ts
      const def = await handleDefinitions(path, method, req, user, extraHeaders, deps);
      if (def) return def;
```
Bunu admin dispatch'inden sonra, 404 dönüşünden önce koy.

- [ ] **Step 5: Run tests, verify PASS**

Run: `bun test src/server/routes/definitions.test.ts`
Expected: PASS.

- [ ] **Step 6: Full suite + commit**

Run: `bun test`
```bash
git add src/server/routes/definitions.ts src/server/routes/definitions.test.ts src/server/handler.ts
git commit -m "feat: departments API (list + admin CRUD)"
```

---

## Task 3: Talep oluşturmada katılık kontrolü

**Files:**
- Modify: `src/server/routes/requests.ts` (POST /api/requests'e kontrol)
- Test: `src/server/routes/requests.test.ts` (yeni testler)

- [ ] **Step 1: Başarısız testleri yaz**

`src/server/routes/requests.test.ts`'e ekle (harness'ın in-memory DB'sinde departments/modules tabloları olmalı — yoksa test schema'sına ekle):
```ts
test("create request rejects unknown department → 400", async () => {
  const fd = newRequestForm({ department: "YokDept" }); // helper that builds valid FormData with overrides
  const res = await handler(reqMultipart("/api/requests", fd, userCookieCsrf()));
  expect(res.status).toBe(400);
});

test("create request rejects module not under the chosen department → 400", async () => {
  const d = repo.createDepartment("Üretim", deps.now());
  repo.createModule(d.id, "Stok", deps.now());
  repo.createDepartment("Muhasebe", deps.now());
  const fd = newRequestForm({ department: "Muhasebe", module_area: "Stok" }); // Stok belongs to Üretim
  const res = await handler(reqMultipart("/api/requests", fd, userCookieCsrf()));
  expect(res.status).toBe(400);
});

test("create request accepts valid department + module → 201", async () => {
  const d = repo.createDepartment("Üretim", deps.now());
  repo.createModule(d.id, "Stok", deps.now());
  const fd = newRequestForm({ department: "Üretim", module_area: "Stok" });
  const res = await handler(reqMultipart("/api/requests", fd, userCookieCsrf()));
  expect(res.status).toBe(201);
});

test("create request accepts valid department + empty module → 201", async () => {
  repo.createDepartment("İK", deps.now());
  const fd = newRequestForm({ department: "İK", module_area: "" });
  const res = await handler(reqMultipart("/api/requests", fd, userCookieCsrf()));
  expect(res.status).toBe(201);
});
```
Eğer test dosyasında zaten bir `newRequestForm`/`reqMultipart` benzeri helper varsa onu kullan; yoksa mevcut create-request testlerindeki FormData kurulumunu bir helper'a çıkar (DRY). Mevcut "happy path create → 201" testi muhtemelen departman tanımı OLMADAN geçiyordu — artık katılık eklendiğinde o test KIRILABİLİR. O testi de geçerli bir departman seed'leyip onu kullanacak şekilde güncelle (TDD: testleri yeşil tut).

- [ ] **Step 2: Run, verify FAIL**

Run: `bun test src/server/routes/requests.test.ts`
Expected: yeni testler FAIL (katılık yok → geçersiz departman 201 dönüyor).

- [ ] **Step 3: requests.ts'e katılık ekle**

`src/server/routes/requests.ts` POST /api/requests handler'ında, `newRequestSchema.safeParse` BAŞARILI olduktan SONRA ve `processUploads`'tan ÖNCE ekle:
```ts
    // Strictness: department must exist; module (if given) must belong to it.
    const dept = deps.repo.getDepartmentByName(parsed.data.department);
    if (!dept) {
      return json({ errors: ["Geçersiz departman"] }, 400, extraHeaders);
    }
    if (parsed.data.module_area && !deps.repo.listModuleNames(dept.id).includes(parsed.data.module_area)) {
      return json({ errors: ["Geçersiz modül"] }, 400, extraHeaders);
    }
```
(Değişken adları mevcut handler'la uyumlu olmalı — `parsed`, `extraHeaders`, `json`, `deps` zaten kullanımda; dosyayı oku ve aynı isimleri kullan.)

- [ ] **Step 4: Run, verify PASS + fix the old happy-path test**

Run: `bun test src/server/routes/requests.test.ts`
Expected: yeni testler PASS. Eğer önceden var olan create testleri kırıldıysa (departman seed'lemeden 201 bekliyorlardı), onları geçerli bir departman (ve gerekiyorsa modül) seed'leyip o değerleri kullanacak şekilde güncelle. Hepsi yeşil olana kadar devam.

- [ ] **Step 5: Full suite + commit**

Run: `bun test`
```bash
git add src/server/routes/requests.ts src/server/routes/requests.test.ts
git commit -m "feat: enforce department/module against managed lists on request create"
```

---

## Task 4: Admin "Tanımlar" sayfası

**Files:**
- Create: `src/client/pages/Definitions.tsx`
- Modify: `src/client/app.tsx` (route `/admin/tanimlar` + nav link "Tanımlar" for admins)
- Modify: `src/client/api.ts` — (gerekiyorsa) DELETE helper; `apiSend` zaten method alıyor, ekstra gerekmez.

- [ ] **Step 1: Definitions sayfasını oluştur**

Create `src/client/pages/Definitions.tsx`. Read `src/client/pages/Admin.tsx` for the page pattern (useUser gate via inner component, Spinner, error state, apiGet). Shape:
```tsx
// src/client/pages/Definitions.tsx — admin-only management of departments & their modules.
import { useState, useEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { apiGet, apiSend } from "../api";
import { useUser } from "../auth";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

type Dept = { id: number; name: string; modules: { id: number; name: string }[] };

export function Definitions() {
  const user = useUser();
  if (!user.isAdmin) return <Navigate to="/my" replace />;
  return <DefinitionsInner />;
}

const inputCls = "border border-border-subtle rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary";

function DefinitionsInner() {
  const [depts, setDepts] = useState<Dept[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newDept, setNewDept] = useState("");

  const load = useCallback(() => {
    setError(null);
    apiGet<Dept[]>("/api/departments").then(setDepts).catch((e) =>
      setError(e instanceof Error ? e.message : "Hata"));
  }, []);
  useEffect(load, [load]);

  async function addDept() {
    const name = newDept.trim();
    if (!name) return;
    try { await apiSend("/api/admin/departments", "POST", JSON.stringify({ name }), "application/json"); setNewDept(""); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Hata"); }
  }
  async function delDept(id: number) {
    try { await apiSend(`/api/admin/departments/${id}`, "DELETE"); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Hata"); }
  }
  async function addModule(deptId: number, name: string, reset: () => void) {
    const n = name.trim();
    if (!n) return;
    try { await apiSend(`/api/admin/departments/${deptId}/modules`, "POST", JSON.stringify({ name: n }), "application/json"); reset(); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Hata"); }
  }
  async function delModule(id: number) {
    try { await apiSend(`/api/admin/modules/${id}`, "DELETE"); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Hata"); }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight mb-4">Tanımlar — Departman & Modül</h1>
      {error && <div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded p-3 text-sm mb-4">{error}</div>}

      <Card className="p-4 mb-6">
        <div className="flex gap-2">
          <input className={`${inputCls} flex-1`} placeholder="Yeni departman adı" value={newDept}
            onChange={(e) => setNewDept(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addDept()} />
          <Button type="button" onClick={addDept}>Departman ekle</Button>
        </div>
      </Card>

      {!depts && !error && <p className="text-on-surface-variant">Yükleniyor…</p>}
      {depts && depts.length === 0 && <p className="text-on-surface-variant">Henüz departman yok.</p>}
      <div className="flex flex-col gap-3">
        {depts?.map((d) => <DeptCard key={d.id} d={d} onDelDept={delDept} onAddModule={addModule} onDelModule={delModule} />)}
      </div>
    </main>
  );
}

function DeptCard({ d, onDelDept, onAddModule, onDelModule }: {
  d: Dept;
  onDelDept: (id: number) => void;
  onAddModule: (deptId: number, name: string, reset: () => void) => void;
  onDelModule: (id: number) => void;
}) {
  const [mod, setMod] = useState("");
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">{d.name}</h2>
        <button type="button" className="text-danger text-sm hover:underline" onClick={() => onDelDept(d.id)}>Sil</button>
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {d.modules.map((m) => (
          <span key={m.id} className="inline-flex items-center gap-1 border border-border-subtle rounded-lg px-2.5 py-0.5 text-xs">
            {m.name}
            <button type="button" className="text-danger" aria-label={`${m.name} sil`} onClick={() => onDelModule(m.id)}>✕</button>
          </span>
        ))}
        {d.modules.length === 0 && <span className="text-xs text-on-surface-variant">Modül yok</span>}
      </div>
      <div className="flex gap-2">
        <input className={`${inputCls} flex-1 text-sm`} placeholder="Yeni modül" value={mod}
          onChange={(e) => setMod(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAddModule(d.id, mod, () => setMod(""))} />
        <Button type="button" size="sm" variant="secondary" onClick={() => onAddModule(d.id, mod, () => setMod(""))}>Modül ekle</Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: api.ts — apiSend opsiyonel content-type**

`src/client/api.ts` `apiSend` imzası şu an `(path, method, body?)`. JSON gövde için bir content-type parametresi ekle (FormData'da content-type set ETME). Read api.ts; güncelle:
```ts
export async function apiSend<T>(path: string, method: string, body?: BodyInit, contentType?: string): Promise<T | null> {
  const headers: Record<string, string> = { "X-CSRF-Token": readCookie("csrf") ?? "" };
  if (contentType) headers["Content-Type"] = contentType;
  // ... existing fetch with credentials, headers, body; keep 401/204/error handling ...
}
```
FormData çağrıları (NewRequest/reply/admin) `contentType` vermez → tarayıcı boundary'yi kendi koyar (mevcut davranış korunur). Mevcut `apiSend` testini bu imzayla uyumlu tut; gerekiyorsa `src/client/api.test.ts`'e bir JSON-content-type testi ekle.

- [ ] **Step 3: app.tsx — route + nav link**

`src/client/app.tsx`: `/admin/tanimlar` route'unu (AppLayout içinde) `<Definitions/>` ile ekle. Header nav'da admin için mevcut "Yönetim" linkinin yanına `{user.isAdmin && <NavLink to="/admin/tanimlar">Tanımlar</NavLink>}` ekle (mevcut nav stilini izle). Import `Definitions`.

- [ ] **Step 4: Build gate + commit**

Run: `bun run build` (başarılı olmalı). `bun test` (yeşil; api.test.ts güncellendiyse dahil).
```bash
git add src/client/pages/Definitions.tsx src/client/app.tsx src/client/api.ts src/client/api.test.ts
git commit -m "feat: admin definitions page (departments & modules)"
```

---

## Task 5: NewRequest form — departman/modül select'leri

**Files:**
- Modify: `src/client/pages/NewRequest.tsx`

- [ ] **Step 1: Formu select'lere çevir**

`src/client/pages/NewRequest.tsx`'i oku. Şu an `department` text input, `module_area` text input. Değiştir:
- Mount'ta `apiGet<Dept[]>("/api/departments")` ile listeyi yükle (`type Dept = {id, name, modules:{id,name}[]}`). Yüklenirken küçük "Yükleniyor…".
- `department`: zorunlu `<select>` (boş "Seçiniz…" + her departman `name` value'lu). Seçimi state'te tut.
- `module_area`: seçili departmanın modülleri varsa bir `<select>` (boş "Seçiniz…" opsiyonel + modül `name`'leri); modül yoksa alanı **gizle** (hidden değil, render etme).
- Departman listesi BOŞSA: form yerine bir uyarı göster: "Henüz departman tanımlanmamış. Yöneticiye başvurun." ve submit'i engelle.
- Submit: FormData'ya seçili `department` ve (varsa) `module_area` değerlerini koy. Diğer alanlar aynı. `apiSend("/api/requests","POST",fd)` (FormData → contentType verme).
- Stitch stili korunur (uppercase label, focus ring, kırmızı asterisk department'ta).

Örnek select kısmı:
```tsx
<label className="block">
  <span className="block text-xs font-semibold uppercase tracking-wide mb-1 text-on-surface-variant">Departman <span className="text-danger">*</span></span>
  <select required name="department" value={dept} onChange={(e) => { setDept(e.target.value); setModule(""); }}
    className={inputCls}>
    <option value="">Seçiniz…</option>
    {depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
  </select>
</label>
{selectedDept && selectedDept.modules.length > 0 && (
  <label className="block">
    <span className="block text-xs font-semibold uppercase tracking-wide mb-1 text-on-surface-variant">Modül / Alan</span>
    <select name="module_area" value={module} onChange={(e) => setModule(e.target.value)} className={inputCls}>
      <option value="">Seçiniz…</option>
      {selectedDept.modules.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
    </select>
  </label>
)}
```
where `selectedDept = depts.find((d) => d.name === dept)`. Keep `dept`/`module` in state; build FormData from state + the other refs/inputs on submit (since department/module are now controlled, set them into the FormData explicitly).

- [ ] **Step 2: Build gate + commit**

Run: `bun run build` (başarılı). `bun test` (yeşil).
```bash
git add src/client/pages/NewRequest.tsx
git commit -m "feat: new-request form uses managed department/module selects"
```

---

## Task 6: Final doğrulama

**Files:** (yok — doğrulama)

- [ ] **Step 1: Tam test**

Run: `bun test` → istisnasız yeşil.

- [ ] **Step 2: Build**

Run: `bun run build` → `public/client.js` + `app.css` üretilir, hata yok.

- [ ] **Step 3: Manuel/görsel smoke (opsiyonel ama önerilir)**

Sunucuyu seed'li env ile başlat (admin cookie mint et — bkz. önceki seed yöntemi). Doğrula: `/admin/tanimlar`'da departman+modül ekle/sil çalışıyor; Yeni Talep formunda departman select'i doluyor, departman seçilince modüller geliyor; geçersiz departmanla submit (DevTools'tan zorlanırsa) 400; geçerli submit talep oluşturuyor.

- [ ] **Step 4: finishing-a-development-branch**

Tamamlandığında `superpowers:finishing-a-development-branch` ile kapatma seçeneklerini değerlendir.

---

## Self-Review Notları
- **Spec kapsamı:** §3 tablolar→Task1; §4 katmanlama→Task1-3; §5 API→Task2 + katılık Task3; §6 frontend→Task4-5; §7 test→her task'ta. Tümü karşılanıyor.
- **Snapshot korunuyor:** requests şeması değişmiyor; department/module text olarak yazılıyor (mevcut createRequest). Task'larda şema değişikliği yok — doğru.
- **Tip tutarlılığı:** `Department`, `ModuleRow`, `DepartmentWithModules` Task1'de tanımlı; Task2-3-4-5 aynı isimleri kullanıyor. `getDepartment`/`getDepartmentByName`/`listModuleNames`/`listDepartmentsWithModules` imzaları tutarlı.
- **CSRF/authz:** tüm admin mutating route'ları handler'ın MUTATING CSRF gate'inden geçer (DELETE dahil — A1 fix); handleDefinitions ayrıca isAdmin kontrol eder.
- **Eski test kırılması:** Task3 mevcut create-request testlerini geçerli departman seed'leyecek şekilde günceller — açıkça not edildi.
