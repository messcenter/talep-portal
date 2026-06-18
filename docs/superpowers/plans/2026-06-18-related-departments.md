# İlgili Departmanlar Implementation Plan

> **For agentic workers:** Companion design: `docs/superpowers/specs/2026-06-18-related-departments-design.md`. TDD, tiny commits.

**Goal:** Talebe opsiyonel çoklu "ilgili departmanlar" etiketi ekleme; admin "Tüm Talepler" listesinde department filtresi (ana VEYA ilgili eşleşmesi).

**Önemli tuzak:** Entegrasyon testleri `db.ts` migration'ını kullanmaz → `request_departments` tablosu hem `db.ts`'e hem 5 test dosyasının `schema()`'sına eklenmeli (Task 1).

---

## Task 1: DB şema + Repo

**Files:** `src/db/db.ts`, `src/db/repo.ts`, `src/db/repo.test.ts`, 4 route test schema()

- [ ] **Step 1: repo.test.ts'e başarısız testler**

```typescript
describe("repo.relatedDepartments", () => {
  test("createRequest persists related departments", () => {
    const r = repo.createRequest(baseInput, "2026-01-01T00:00:00.000Z", [], ["Lojistik", "IT"]);
    expect(repo.listRelatedDepartments(r.id)).toEqual(["IT", "Lojistik"]); // sorted by name
  });
  test("createRequest without related → []", () => {
    const r = repo.createRequest(baseInput, "2026-01-01T00:00:00.000Z");
    expect(repo.listRelatedDepartments(r.id)).toEqual([]);
  });
  test("listAll filters by main OR related department", () => {
    const r1 = repo.createRequest({ ...baseInput, department: "Üretim" }, "t", [], ["Lojistik"]);
    const r2 = repo.createRequest({ ...baseInput, department: "Lojistik" }, "t", [], []);
    const r3 = repo.createRequest({ ...baseInput, department: "IT" }, "t", [], []);
    const rows = repo.listAll({ department: "Lojistik" });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(r1.id); // related match
    expect(ids).toContain(r2.id); // main match
    expect(ids).not.toContain(r3.id);
  });
  test("listAll combines status + department", () => {
    const r = repo.createRequest({ ...baseInput, department: "Üretim" }, "t", [], ["Lojistik"]);
    repo.updateStatus(r.id, "accepted");
    expect(repo.listAll({ department: "Lojistik", status: "accepted" }).map((x) => x.id)).toContain(r.id);
    expect(repo.listAll({ department: "Lojistik", status: "new" })).toEqual([]);
  });
});
```

- [ ] **Step 2: db.ts'e tablo** (applications sonrasına):

```sql
    CREATE TABLE IF NOT EXISTS request_departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      department TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(request_id, department)
    );
    CREATE INDEX IF NOT EXISTS idx_request_departments_request ON request_departments(request_id);
    CREATE INDEX IF NOT EXISTS idx_request_departments_dept ON request_departments(department);
```

- [ ] **Step 3: 5 test schema()'sına tablo** (`repo.test.ts`, `requests/admin/attachments/definitions.test.ts`). Aynı `subscribers` deseniyle, her `schema()`'nın sonuna `db.exec(\`CREATE TABLE request_departments ... UNIQUE(request_id, department)\`)` + index ekle.

- [ ] **Step 4: repo.ts createRequest + yeni metodlar**

```typescript
// createRequest imzası:
createRequest(input, createdAt, attachments = [], relatedDepartments: string[] = []): RequestRow
// transaction içinde insertAttachments'tan sonra:
for (const name of relatedDepartments) {
  db.query(`INSERT OR IGNORE INTO request_departments (request_id, department, created_at) VALUES (?, ?, ?)`)
    .run(inserted.id, name, createdAt);
}

listRelatedDepartments(requestId): string[] {
  return db.query<{ department: string }, [number]>(
    "SELECT department FROM request_departments WHERE request_id = ? ORDER BY department",
  ).all(requestId).map((r) => r.department);
}

// listAll filter'a department ekle:
// clauses'a (parametre doluysa):
//   clauses.push("(r.department = $dept OR EXISTS (SELECT 1 FROM request_departments rd WHERE rd.request_id = r.id AND rd.department = $dept))");
//   params.$dept = filter.department;
// (no-clause branch'da da aynı WHERE uygulanmalı → listAll'u her zaman WHERE üretecek şekilde refactor et)
```

> **Refactor:** mevcut `listAll` "clauses boşsa WHERE'siz SELECT" yapıyor. department filtresi eklendiğinde bu dallanma korunabilir; sadece `if (filter.department)` clauses ekle. Test 1+2 clauses'suz, 3+4 clause'lu.

- [ ] **Step 5: Testler yeşil, commit**

```bash
git add src/db/db.ts src/db/repo.ts src/db/repo.test.ts src/server/routes/requests.test.ts src/server/routes/admin.test.ts src/server/routes/attachments.test.ts src/server/routes/definitions.test.ts
git commit -m "feat(db): request_departments table + related-dept filter"
```

---

## Task 2: Validation şeması

**Files:** `src/domain/validation.ts`, `src/domain/validation.test.ts`

- [ ] **Step 1: test**

```typescript
test("related_departments optional, defaults to []", () => {
  expect(newRequestSchema.safeParse({ ...validBase }).data?.related_departments).toEqual([]);
});
test("related_departments max 10", () => {
  const arr = Array.from({ length: 11 }, (_, i) => `D${i}`);
  expect(newRequestSchema.safeParse({ ...validBase, related_departments: arr }).success).toBe(false);
});
```

- [ ] **Step 2: validation.ts'e alan**

```typescript
related_departments: z
  .array(z.string().trim().min(1).max(120))
  .max(10, "En fazla 10 ilgili departman")
  .optional()
  .default([]),
```

- [ ] **Step 3: commit** `feat(domain): related_departments in newRequestSchema`

---

## Task 3: Server routes (POST + detail + admin filter)

**Files:** `src/server/routes/requests.ts`, `src/server/routes/admin.ts`, testleri

- [ ] **Step 1: requests.test.ts testleri**

```typescript
describe("POST /api/requests — related departments", () => {
  function formWith(related: string[]) {
    const fd = validFormData(); fd.set("department", "IT");
    for (const d of related) fd.append("related_departments", d);
    return fd;
  }
  beforeEach(() => { seedDept("IT"); seedDept("Lojistik"); seedDept("Üretim"); });

  test("creates request with related departments", async () => {
    const r = await handler(new Request("http://x/api/requests", {
      method: "POST", headers: { cookie: authedCookie(), "x-csrf-token": "tok" },
      body: formWith(["Lojistik", "Üretim"]),
    }));
    expect(r.status).toBe(201);
    const id = (await r.json()).id;
    expect(repo.listRelatedDepartments(id)).toEqual(["Lojistik", "Üretim"]);
  });
  test("unmanaged related department → 400", async () => {
    seedDept("IT");
    const r = await handler(new Request("http://x/api/requests", {
      method: "POST", headers: { cookie: authedCookie(), "x-csrf-token": "tok" },
      body: formWith(["Bilinmeyen"]),
    }));
    expect(r.status).toBe(400);
  });
  test("main department repeated in related → 400", async () => {
    const r = await handler(new Request("http://x/api/requests", {
      method: "POST", headers: { cookie: authedCookie(), "x-csrf-token": "tok" },
      body: formWith(["IT"]),
    }));
    expect(r.status).toBe(400);
  });
  test("GET detail includes related_departments", async () => {
    const r = repo.createRequest({ ...baseInput, department: "IT" }, "t", [], ["Lojistik"]);
    const res = await handler(new Request(`http://x/api/requests/${r.id}`, { headers: { cookie: authedCookie() } }));
    expect((await res.json()).related_departments).toEqual(["Lojistik"]);
  });
});
```

- [ ] **Step 2: requests.ts POST + GET güncelle**

`collectRelatedDepartments(form)` yardımcısı (dosya içi):

```typescript
function collectRelatedDepartments(form: Record<string, any>): string[] {
  const raw = form.related_departments;
  const arr = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    const s = String(v).trim();
    if (s && !seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}
```

POST handler'da, schema parse sonrası:

```typescript
const related = collectRelatedDepartments(form);
// her biri managed?
for (const d of related) {
  if (!deps.repo.getDepartmentByName(d)) return json({ errors: ["Geçersiz ilgili departman"] }, 400, extraHeaders);
}
// ana dept tekrarı?
if (related.some((d) => d.toLowerCase() === parsed.data.department.toLowerCase()))
  return json({ errors: ["Ana departman ilgili listesinde olamaz"] }, 400, extraHeaders);
// createRequest çağrısına 4. argüman olarak geçir:
r = deps.repo.createRequest({ ...parsed.data, requester_name: user.name, requester_email: user.email }, deps.now(), up.attachments, related);
```

GET detail yanıtına ekle:

```typescript
related_departments: deps.repo.listRelatedDepartments(r.id),
```

- [ ] **Step 3: admin.test.ts filter testleri**

```typescript
describe("GET /api/admin/requests?department=", () => {
  test("matches main OR related", async () => {
    const r1 = repo.createRequest({ ...baseInput, department: "Üretim" }, "t", [], ["Lojistik"]);
    const r2 = repo.createRequest({ ...baseInput, department: "Lojistik" }, "t", [], []);
    const res = await handler(new Request("http://x/api/admin/requests?department=Lojistik", { headers: { cookie: adminCookie() } }));
    const ids = (await res.json()).map((r: any) => r.id);
    expect(ids).toContain(r1.id);
    expect(ids).toContain(r2.id);
  });
});
```

- [ ] **Step 4: admin.ts department param oku**

```typescript
const department = url.searchParams.get("department") ?? undefined;
const rows = deps.repo.listAll({ status, priority: undefined, department });
```

- [ ] **Step 5: commit** `feat(server): related departments create/detail + admin dept filter`

---

## Task 4: NewRequest formu — çoklu seçim

**Files:** `src/client/pages/NewRequest.tsx`

- [ ] **Step 1: state + UI**

```typescript
const [relatedDepts, setRelatedDepts] = useState<Set<string>>(new Set());
// ana dept hariç managed listesi:
const otherDepts = (depts ?? []).filter((d) => d.name !== dept);
// toggle:
function toggleRelated(name: string) {
  setRelatedDepts((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
}
// ana dept değişince, seçili ilgililer içinde yeni ana dept varsa temizle:
useEffect(() => {
  setRelatedDepts((prev) => {
    const next = new Set(prev);
    next.delete(dept);
    return next;
  });
}, [dept]);
```

Submit'te: `for (const d of relatedDepts) fd.append("related_departments", d);`

UI (Kapsam bölümünde, application satırından sonra):

```tsx
{otherDepts.length > 0 && (
  <div className="mt-4">
    <FieldLabel htmlFor="related_departments">İlgili Departmanlar</FieldLabel>
    <div className="flex flex-wrap gap-2" id="related_departments">
      {otherDepts.map((d) => {
        const active = relatedDepts.has(d.name);
        return (
          <button type="button" key={d.id}
            onClick={() => toggleRelated(d.name)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              active
                ? "bg-primary text-white border-primary"
                : "bg-surface text-on-surface border-border hover:bg-surface-tonal"
            }`}>
            {d.name}
          </button>
        );
      })}
    </div>
    <p className="text-xs text-on-surface-variant mt-1">Opsiyonel · bu talebi ilgilendiren diğer departmanlar</p>
  </div>
)}
```

- [ ] **Step 2: build, commit** `feat(client): related-departments multiselect in new request form`

---

## Task 5: Detail chip + Admin department filtresi

**Files:** `src/client/components/RequestMeta.tsx`, `src/client/pages/Admin.tsx`, `src/client/hooks/useRequestDetail.ts`

- [ ] **Step 1: DetailData'ya related_departments**

`useRequestDetail.ts`:

```typescript
export interface DetailData {
  ...,
  related_departments: string[];
}
```

- [ ] **Step 2: RequestMeta'ya chip'ler**

`RequestMeta`'ya prop: `relatedDepartments?: string[]`. Ana satırın altında:

```tsx
{relatedDepartments && relatedDepartments.length > 0 && (
  <div className="flex flex-wrap gap-1.5 mt-1">
    <span className="text-xs text-on-surface-variant">İlgili:</span>
    {relatedDepartments.map((d) => (
      <span key={d} className="text-xs px-2 py-0.5 rounded-full bg-surface-tonal border border-border-subtle text-on-surface">
        {d}
      </span>
    ))}
  </div>
)}
```

İki detail sayfasında `RequestMeta` çağrısına `relatedDepartments={data.related_departments}` geçir.

- [ ] **Step 3: Admin.tsx department filtresi**

State: `const [deptFilter, setDeptFilter] = useState("");` + managed depts yükle (`/api/departments`). query string'e ekle: `?status=${active}${deptFilter ? `&department=${encodeURIComponent(deptFilter)}` : ""}`. Status tab'larının altına bir `<select>` render et ("Tüm departmanlar" + her dept).

- [ ] **Step 4: build, commit** `feat(client): related-dept chips on detail + admin dept filter`

---

## Task 6: Tam gate + build

- [ ] `bun test` → PASS
- [ ] `bun run build` → temiz
- [ ] Manuel: yeni talep ilgili dept'lerle oluştur → detail'de chip'ler → admin listede "Lojistik" filtre → talep görünüyor.

## Self-Review

- **Name-based saklama** mevcut `requests.department` deseniyle tutarlı; FK/cascade karmaşası yok.
- **Ana-dept tekrarı** hem UI'da (ana hariç tut) hem backend'de (400) zorlanır.
- **listAll refactor:** department clause eklendiğinde mevcut "boş clause → WHERE'siz" dalı bozulmaz; sadece `if (filter.department)` clause push'la.
- **Test schema tuzağı:** 5 dosyaya tablo eklemeyi unutma (Task 1 Step 3).
