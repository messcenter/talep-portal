# UX Cila & Kalite Paketi — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Çalışan portalının dört cila açığını kapat — yönetilen "Uygulama" listesi, tutarlı dosya-ekleme bileşeni, yıkıcı silmelerde onay, başarı toast'ları + mobil/erişilebilirlik.

**Architecture:** Mevcut katmanlama korunur (CLAUDE.md §2). Yeni `applications` varlığı `departments` desenini birebir aynalar (db → repo → route → client). Frontend için tekrar kullanılabilir bileşenler (`FilePicker`, `ConfirmDialog`, `Toast`). Backend tam TDD; saf yardımcılar birim test; React bileşenleri `renderToStaticMarkup` ile SSR-smoke test; etkileşim/bağlama `bun run build` + Playwright ile elle doğrulanır.

**Tech Stack:** Bun, `bun:sqlite`, `Bun.serve`, React 19 (react-router, react-dom/server testte), Radix Dialog (shadcn), Tailwind, Zod, `bun test`.

**Referanslar (oku):** Spec `docs/superpowers/specs/2026-06-13-ux-polish-quality-design.md`. Aynalanacak desenler: `src/db/repo.ts:203-240` (departman CRUD), `src/server/routes/definitions.ts` (route), `src/server/routes/definitions.test.ts` (test), `src/client/components/forms.ts` (paylaşılan sınıflar), `src/client/api.ts` (`apiGet`/`apiSend`), `src/components/ui/dialog.tsx` (Radix sarmalı).

---

## Faz A — Applications backend (yönetilen liste)

### Task A1: `applications` tablosu + repo CRUD

**Files:**
- Modify: `src/db/db.ts` (migrate — yeni tablo)
- Modify: `src/db/repo.ts:51-55` (tip) ve `:203-240` civarı (metotlar)
- Test: `src/db/repo.test.ts` (yeni testler ekle)

- [ ] **Step 1: Failing repo testleri yaz**

`src/db/repo.test.ts` dosyasının sonuna ekle (dosyanın kendi in-memory şema kurulum yardımcısını kullanır; departman testleriyle aynı tarzda). Eğer test dosyası şemayı kendi kuruyorsa, `applications` tablosunu o şemaya da ekle:

```ts
import { expect, test, describe } from "bun:test";
// (mevcut import'lar + makeRepo + db kurulum yardımcısı dosyada zaten var)

describe("applications CRUD", () => {
  test("create + list returns the application", () => {
    const repo = makeRepo(freshDb()); // dosyadaki mevcut yardımcı
    const a = repo.createApplication("ERP", "2026-01-01T00:00:00.000Z");
    expect(a.id).toBeGreaterThan(0);
    expect(a.name).toBe("ERP");
    const list = repo.listApplications();
    expect(list.map((x) => x.name)).toEqual(["ERP"]);
  });

  test("list is alphabetical", () => {
    const repo = makeRepo(freshDb());
    repo.createApplication("MES", "2026-01-01T00:00:00.000Z");
    repo.createApplication("CRM", "2026-01-01T00:00:00.000Z");
    expect(repo.listApplications().map((x) => x.name)).toEqual(["CRM", "MES"]);
  });

  test("duplicate name throws (UNIQUE)", () => {
    const repo = makeRepo(freshDb());
    repo.createApplication("ERP", "2026-01-01T00:00:00.000Z");
    expect(() => repo.createApplication("ERP", "2026-01-01T00:00:00.000Z")).toThrow();
  });

  test("getApplication + deleteApplication", () => {
    const repo = makeRepo(freshDb());
    const a = repo.createApplication("ERP", "2026-01-01T00:00:00.000Z");
    expect(repo.getApplication(a.id)?.name).toBe("ERP");
    repo.deleteApplication(a.id);
    expect(repo.getApplication(a.id)).toBeNull();
    expect(repo.listApplications()).toEqual([]);
  });
});
```

> NOT: `freshDb()` yerine `repo.test.ts` içinde departman testlerinin kullandığı kurulum neyse onu kullan. Eğer departman testleri `openDb(":memory:")` kullanıyorsa A1 migration adımı tabloyu zaten sağlar; eğer satıriçi `CREATE TABLE` şeması varsa, o şemaya `applications` tablosunu da ekle (bkz. Step 3).

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `bun test src/db/repo.test.ts`
Expected: FAIL — `repo.createApplication is not a function`.

- [ ] **Step 3: Migration + tip + repo metotlarını ekle**

`src/db/db.ts` — `migrate()` içindeki SQL bloğunun sonuna (modules tablosundan sonra) ekle:

```sql
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
```

`src/db/repo.ts` — tip bloğuna (`Department` yanına, `:51-53`) ekle:

```ts
export type Application = { id: number; name: string; created_at: string };
```

`src/db/repo.ts` — `listDepartmentsWithModules` metodundan hemen sonra (`:240` civarı) ekle:

```ts
    createApplication(name: string, createdAt: string): Application {
      return db.query(
        `INSERT INTO applications (name, created_at) VALUES (?, ?) RETURNING *`,
      ).get(name, createdAt) as Application;
    },
    deleteApplication(id: number): void {
      db.query(`DELETE FROM applications WHERE id = ?`).run(id);
    },
    getApplication(id: number): Application | null {
      return (db.query(`SELECT * FROM applications WHERE id = ?`).get(id) as Application) ?? null;
    },
    listApplications(): Application[] {
      return db.query(`SELECT * FROM applications ORDER BY name`).all() as Application[];
    },
```

Eğer `src/db/repo.test.ts` satıriçi `CREATE TABLE` şeması kullanıyorsa, o şemaya da ekle:

```sql
CREATE TABLE applications (id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
```

- [ ] **Step 4: Testlerin geçtiğini doğrula**

Run: `bun test src/db/repo.test.ts`
Expected: PASS (yeni 4 test + mevcutlar yeşil).

- [ ] **Step 5: Commit**

```bash
git add src/db/db.ts src/db/repo.ts src/db/repo.test.ts
git commit -m "feat(db): applications table + repo CRUD"
```

---

### Task A2: Applications JSON API

**Files:**
- Modify: `src/server/routes/definitions.ts` (yeni uçlar)
- Test: `src/server/routes/definitions.test.ts` (yeni testler + şemaya tablo)

- [ ] **Step 1: Failing route testleri yaz**

`src/server/routes/definitions.test.ts` — `schema(db)` fonksiyonundaki SQL bloğuna (modules tablosundan sonra) ekle:

```ts
    CREATE TABLE applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
```

Aynı dosyanın sonuna testleri ekle:

```ts
// ─── GET /api/applications ────────────────────────────────────────────────────
describe("GET /api/applications", () => {
  test("normal user → 200, returns applications", async () => {
    repo.createApplication("ERP", "2026-01-01T00:00:00.000Z");
    const res = await handler(new Request("http://x/api/applications", {
      headers: { cookie: userCookie() },
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body.map((a) => a.name)).toEqual(["ERP"]);
  });

  test("no session → 401", async () => {
    const res = await handler(new Request("http://x/api/applications"));
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/admin/applications ─────────────────────────────────────────────
describe("POST /api/admin/applications", () => {
  test("admin valid → 201 {id}", async () => {
    const res = await handler(jsonReq("POST", "/api/admin/applications", { name: "ERP" }, adminCookie()));
    expect(res.status).toBe(201);
    expect((await res.json() as any).id).toBeGreaterThan(0);
  });
  test("non-admin → 403", async () => {
    const res = await handler(jsonReq("POST", "/api/admin/applications", { name: "ERP" }, userCookie()));
    expect(res.status).toBe(403);
  });
  test("blank name → 400", async () => {
    const res = await handler(jsonReq("POST", "/api/admin/applications", { name: "  " }, adminCookie()));
    expect(res.status).toBe(400);
  });
  test("duplicate → 409", async () => {
    await handler(jsonReq("POST", "/api/admin/applications", { name: "ERP" }, adminCookie()));
    const res = await handler(jsonReq("POST", "/api/admin/applications", { name: "ERP" }, adminCookie()));
    expect(res.status).toBe(409);
  });
});

// ─── DELETE /api/admin/applications/:id ───────────────────────────────────────
describe("DELETE /api/admin/applications/:id", () => {
  test("existing → 204", async () => {
    const a = repo.createApplication("ERP", "2026-01-01T00:00:00.000Z");
    const res = await handler(new Request(`http://x/api/admin/applications/${a.id}`, {
      method: "DELETE", headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(204);
  });
  test("nonexistent → 404", async () => {
    const res = await handler(new Request("http://x/api/admin/applications/99999", {
      method: "DELETE", headers: { cookie: adminCookie(), "x-csrf-token": "tok" },
    }));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `bun test src/server/routes/definitions.test.ts`
Expected: FAIL — `/api/applications` 404/handled değil (route yok).

- [ ] **Step 3: Route handler'larını ekle**

`src/server/routes/definitions.ts` — `GET /api/departments` bloğundan sonra ekle:

```ts
  // GET /api/applications — any authenticated user (needed to populate forms)
  if (path === "/api/applications" && method === "GET") {
    return json(deps.repo.listApplications(), 200, extraHeaders);
  }
```

Aynı dosyada, admin-gate `if (path.startsWith("/api/admin/departments") || path.startsWith("/api/admin/modules"))` koşulunu uygulamaları da kapsayacak şekilde genişlet:

```ts
  if (
    path.startsWith("/api/admin/departments") ||
    path.startsWith("/api/admin/modules") ||
    path.startsWith("/api/admin/applications")
  ) {
    if (!user.isAdmin) return json({ error: "forbidden" }, 403, extraHeaders);
```

Aynı admin bloğunun içine (örn. `DELETE /api/admin/modules/:id` bloğundan sonra) ekle:

```ts
    // POST /api/admin/applications
    if (path === "/api/admin/applications" && method === "POST") {
      const name = await readName(req);
      if (!name) return json({ errors: ["İsim gerekli"] }, 400, extraHeaders);
      try {
        const a = deps.repo.createApplication(name, deps.now());
        return json({ id: a.id }, 201, extraHeaders);
      } catch (e) {
        if (isUniqueErr(e)) return json({ error: "Bu uygulama zaten var" }, 409, extraHeaders);
        throw e;
      }
    }

    // DELETE /api/admin/applications/:id
    m = path.match(/^\/api\/admin\/applications\/(\d+)$/);
    if (m && method === "DELETE") {
      const id = Number(m[1]);
      if (!deps.repo.getApplication(id)) return json({ error: "not found" }, 404, extraHeaders);
      deps.repo.deleteApplication(id);
      return new Response(null, { status: 204, headers: extraHeaders });
    }
```

> NOT: `m` değişkeni mevcut blokta `let m = path.match(...)` ile zaten tanımlı; yeni `m = path.match(...)` ataması aynı kapsamı kullanır. Sıralamada uygulama bloğunu mevcut `m` yeniden-atamalarından sonra koy.

- [ ] **Step 4: Testlerin geçtiğini doğrula**

Run: `bun test src/server/routes/definitions.test.ts`
Expected: PASS.

- [ ] **Step 5: Tüm suite yeşil mi?**

Run: `bun test`
Expected: PASS (önceki 192 + yeni testler).

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/definitions.ts src/server/routes/definitions.test.ts
git commit -m "feat(api): applications endpoints (GET + admin POST/DELETE)"
```

---

## Faz B — Applications istemci (form + tanımlar)

### Task B1: Yeni Talep formunda "Uygulama" dropdown

**Files:**
- Modify: `src/client/pages/NewRequest.tsx`

- [ ] **Step 1: Uygulama state + yükleme ekle**

`NewRequest()` içinde, mevcut `const [moduleName, setModuleName] = useState("");` satırından sonra ekle:

```tsx
  const [apps, setApps] = useState<{ id: number; name: string }[] | null>(null);
  const [app, setApp] = useState("");
```

Mevcut `useEffect(() => { apiGet<Dept[]>("/api/departments")... })` bloğunu, uygulamaları da yükleyecek şekilde değiştir:

```tsx
  useEffect(() => {
    apiGet<Dept[]>("/api/departments")
      .then(setDepts)
      .catch((err) =>
        setErrorMsg(err instanceof Error ? err.message : "Departmanlar yüklenemedi."),
      );
    apiGet<{ id: number; name: string }[]>("/api/applications")
      .then(setApps)
      .catch((err) =>
        setErrorMsg(err instanceof Error ? err.message : "Uygulamalar yüklenemedi."),
      );
  }, []);
```

- [ ] **Step 2: Submit'te application'ı controlled değerden gönder**

`handleSubmit` içinde `fd.set("module_area", moduleName);` satırından sonra ekle:

```tsx
    fd.set("application", app);
```

- [ ] **Step 3: "Uygulama" input'unu select ile değiştir**

`NewRequest.tsx` içindeki "Uygulama" alanını (mevcut `<input id="application" ... defaultValue="ERP" .../>` bloğu) şununla değiştir:

```tsx
            <div>
              <FieldLabel htmlFor="application" required>
                Uygulama
              </FieldLabel>
              <select
                id="application"
                name="application"
                required
                value={app}
                onChange={(e) => setApp(e.target.value)}
                className={inputClass}
                disabled={submitting}
              >
                <option value="">Seçiniz…</option>
                {apps?.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
```

- [ ] **Step 4: Uygulama-boş durumunu ele al**

Mevcut "Henüz departman tanımlanmamış" bloğunun yanına, formu sarmalayan `{depts && depts.length > 0 && (...)}` koşulunu hem departman hem uygulama gerektirecek şekilde sıkılaştır. `depts && depts.length === 0` bloğundan sonra ekle:

```tsx
        {apps && apps.length === 0 && (
          <div className="bg-surface-tonal border border-border-subtle rounded p-4 text-sm text-on-surface mt-2">
            Henüz uygulama tanımlanmamış. Lütfen yöneticiye başvurun.
          </div>
        )}
```

ve form sarmalını şu koşula çevir:

```tsx
        {depts && depts.length > 0 && apps && apps.length > 0 && (
```

(Yükleme koşulunu da güncelle: `{!depts && !errorMsg && (...)}` → `{(!depts || !apps) && !errorMsg && (...)}`.)

- [ ] **Step 5: Build + manuel doğrula**

Run: `bun run build`
Expected: hatasız bundle.

Manuel (Playwright veya tarayıcı): `/yeni` → "Uygulama" artık dropdown, "ERP" ön-değeri yok, `Seçiniz…` başlangıçta. Uygulama yoksa uyarı görünür, form gizli.

- [ ] **Step 6: Commit**

```bash
git add src/client/pages/NewRequest.tsx
git commit -m "feat(client): Uygulama as managed dropdown in new-request form"
```

---

### Task B2: Tanımlar'a Uygulamalar yönetim bölümü

**Files:**
- Modify: `src/client/pages/Definitions.tsx`

- [ ] **Step 1: Uygulama state + yükleme + handler'lar ekle**

`DefinitionsInner()` içine, `newDept` state'inden sonra ekle:

```tsx
  const [apps, setApps] = useState<{ id: number; name: string }[] | null>(null);
  const [newApp, setNewApp] = useState("");
```

`load` callback'ini uygulamaları da yükleyecek şekilde değiştir:

```tsx
  const load = useCallback(() => {
    setError(null);
    apiGet<Dept[]>("/api/departments")
      .then(setDepts)
      .catch((e) => setError(e instanceof Error ? e.message : "Bir hata oluştu."));
    apiGet<{ id: number; name: string }[]>("/api/applications")
      .then(setApps)
      .catch((e) => setError(e instanceof Error ? e.message : "Bir hata oluştu."));
  }, []);
```

`delModule` fonksiyonundan sonra ekle:

```tsx
  async function addApp() {
    const name = newApp.trim();
    if (!name) return;
    try {
      await apiSend("/api/admin/applications", "POST", JSON.stringify({ name }), "application/json");
      setNewApp("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    }
  }
  async function delApp(id: number) {
    try {
      await apiSend(`/api/admin/applications/${id}`, "DELETE");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    }
  }
```

- [ ] **Step 2: Başlık + Uygulamalar kartını render et**

Başlığı değiştir:

```tsx
      <h1 className="text-2xl font-bold tracking-tight text-on-surface mb-4">
        Tanımlar — Departman, Modül & Uygulama
      </h1>
```

Departman kartları listesinin (`<div className="flex flex-col gap-3">...</div>`) hemen **öncesine** Uygulamalar kartını ekle:

```tsx
      <Card className="p-4 mb-6">
        <span className="block text-xs font-semibold uppercase tracking-wide mb-2 text-on-surface-variant">
          Uygulamalar
        </span>
        <div className="flex flex-wrap gap-2 mb-3">
          {apps?.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 bg-surface-tonal border border-border-subtle rounded-lg px-2.5 py-1 text-xs"
            >
              {a.name}
              <button
                type="button"
                className="text-danger font-bold leading-none px-1"
                aria-label={`${a.name} sil`}
                onClick={() => delApp(a.id)}
              >
                ✕
              </button>
            </span>
          ))}
          {apps && apps.length === 0 && (
            <span className="text-xs text-on-surface-variant">Uygulama yok</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            className={`${inputCls} flex-1`}
            placeholder="Yeni uygulama (ör. ERP)"
            value={newApp}
            onChange={(e) => setNewApp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addApp();
            }}
          />
          <Button type="button" onClick={addApp}>
            Ekle
          </Button>
        </div>
      </Card>
```

> Onay dialogu Faz D'de bu `delApp`/`delModule`/`delDept` çağrılarına eklenecek; şimdilik doğrudan silsinler.

- [ ] **Step 3: Build + manuel doğrula**

Run: `bun run build`
Expected: hatasız.

Manuel: `/admin/tanimlar` → Uygulamalar kartı; "ERP" ekle → çip görünür; ✕ → silinir; var olanı ekle → "Bu uygulama zaten var" hata kutusu.

- [ ] **Step 4: Commit**

```bash
git add src/client/pages/Definitions.tsx
git commit -m "feat(client): manage applications in Tanımlar page"
```

---

## Faz C — FilePicker bileşeni

### Task C1: `FilePicker` bileşeni + `formatBytes` yardımcısı

**Files:**
- Create: `src/client/components/FilePicker.tsx`
- Test: `src/client/components/FilePicker.test.tsx`

- [ ] **Step 1: Failing test yaz**

`src/client/components/FilePicker.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FilePicker, formatBytes } from "./FilePicker";

test("formatBytes humanizes sizes", () => {
  expect(formatBytes(0)).toBe("0 B");
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(1024)).toBe("1.0 KB");
  expect(formatBytes(1536)).toBe("1.5 KB");
  expect(formatBytes(1048576)).toBe("1.0 MB");
});

test("empty FilePicker shows trigger + empty hint", () => {
  const html = renderToStaticMarkup(<FilePicker value={[]} onChange={() => {}} />);
  expect(html).toContain("Dosya seç");
  expect(html).toContain("Dosya seçilmedi");
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `bun test src/client/components/FilePicker.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Bileşeni yaz**

`src/client/components/FilePicker.tsx`:

```tsx
// src/client/components/FilePicker.tsx
// Controlled multi-file picker. Owns a hidden native <input type=file> and
// surfaces the chosen File[] via value/onChange. The native FileList cannot be
// set programmatically, so the parent must read `value` and append to FormData
// on submit (the native input is intentionally not form-associated).
import { useRef } from "react";
import { fileAccept } from "./forms";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function FilePicker({
  value,
  onChange,
  disabled,
}: {
  value: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    onChange([...value, ...Array.from(list)]);
    if (inputRef.current) inputRef.current.value = ""; // allow re-selecting same file
  }
  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={fileAccept}
        className="sr-only"
        id="file-picker-input"
        disabled={disabled}
        onChange={(e) => addFiles(e.target.files)}
      />
      <label
        htmlFor="file-picker-input"
        className={
          "inline-flex items-center gap-2 rounded border border-border-subtle bg-surface-tonal " +
          "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-on-surface-variant " +
          "cursor-pointer hover:bg-surface-container " +
          (disabled ? "opacity-50 pointer-events-none" : "")
        }
      >
        Dosya seç
      </label>

      {value.length === 0 ? (
        <p className="text-xs text-on-surface-variant mt-2">Dosya seçilmedi</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {value.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between gap-3 text-sm bg-surface-tonal border border-border-subtle rounded px-2.5 py-1.5"
            >
              <span className="truncate text-on-surface">{f.name}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-on-surface-variant">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  className="text-danger font-bold leading-none px-1"
                  aria-label={`${f.name} kaldır`}
                  disabled={disabled}
                  onClick={() => removeAt(i)}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Testlerin geçtiğini doğrula**

Run: `bun test src/client/components/FilePicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/components/FilePicker.tsx src/client/components/FilePicker.test.tsx
git commit -m "feat(client): reusable FilePicker component + formatBytes"
```

---

### Task C2: FilePicker'ı Yeni Talep formuna bağla

**Files:**
- Modify: `src/client/pages/NewRequest.tsx`

- [ ] **Step 1: Import + state ekle**

Üst import'lara ekle:

```tsx
import { FilePicker } from "../components/FilePicker";
```

`app` state'inden sonra ekle:

```tsx
  const [files, setFiles] = useState<File[]>([]);
```

- [ ] **Step 2: Submit'te dosyaları append et**

`handleSubmit` içinde `fd.set("application", app);` satırından sonra ekle:

```tsx
    for (const f of files) fd.append("files", f);
```

- [ ] **Step 3: Native dosya input'unu FilePicker ile değiştir**

"Row 7: File Attachments" bloğundaki `<input id="files" .../>` ve onu saran `<input>`'u kaldırıp şununla değiştir (FieldLabel + ipucu kalır):

```tsx
          {/* Row 7: File Attachments (optional) */}
          <div className="mb-6">
            <FieldLabel htmlFor="file-picker-input">Ekler</FieldLabel>
            <FilePicker value={files} onChange={setFiles} disabled={submitting} />
            <p className="text-xs text-on-surface-variant mt-1">
              PNG, JPEG, WebP, GIF veya PDF · Birden fazla dosya seçilebilir
            </p>
          </div>
```

- [ ] **Step 4: Build + manuel doğrula**

Run: `bun run build`
Expected: hatasız.

Manuel: `/yeni` → "Dosya seç" → dosya(lar) seç → ad+boyut listelenir, ✕ kaldırır; talep gönder → detayında ekler görünür.

- [ ] **Step 5: Commit**

```bash
git add src/client/pages/NewRequest.tsx
git commit -m "feat(client): wire FilePicker into new-request form"
```

---

### Task C3: FilePicker'ı Cevap formuna bağla

**Files:**
- Modify: `src/client/components/ReplyForm.tsx`

- [ ] **Step 1: Import + state ekle**

Üst import'larda `fileInputClass, fileAccept`'i kaldır (artık gereksiz), `inputClass`'ı tut; ekle:

```tsx
import { useState, useRef } from "react";
import { apiSend } from "../api";
import { Button } from "../../components/ui/button";
import { inputClass } from "./forms";
import { FilePicker } from "./FilePicker";
```

`errorMsg` state'inden sonra ekle:

```tsx
  const [files, setFiles] = useState<File[]>([]);
```

- [ ] **Step 2: Submit'te dosyaları append + başarıda temizle**

`handleSubmit` içinde `const fd = new FormData(formRef.current);` satırından sonra ekle:

```tsx
    for (const f of files) fd.append("files", f);
```

Başarı bloğunda (`formRef.current.reset(); onSuccess();`) `reset()`'ten sonra ekle:

```tsx
      setFiles([]);
```

- [ ] **Step 3: Native dosya input'unu FilePicker ile değiştir**

Mevcut dosya `<input name="files" type="file" .../>` ve onu saran `<div className="mb-4">...</div>` bloğunu şununla değiştir:

```tsx
        <div className="mb-4">
          <FilePicker value={files} onChange={setFiles} disabled={submitting} />
          <p className="text-xs text-on-surface-variant mt-1">
            PNG, JPEG, WebP, GIF veya PDF · İsteğe bağlı
          </p>
        </div>
```

- [ ] **Step 4: Build + manuel doğrula**

Run: `bun run build`
Expected: hatasız.

Manuel: bir talebe (clarifying) cevap verirken dosya ekle → gönder → mesaja iliştirilmiş ek görünür.

- [ ] **Step 5: Commit**

```bash
git add src/client/components/ReplyForm.tsx
git commit -m "feat(client): wire FilePicker into reply form"
```

---

### Task C4: FilePicker'ı admin Netleştirme formuna bağla

**Files:**
- Modify: `src/client/components/AdminControls.tsx` (`ClarificationForm`)

- [ ] **Step 1: Import + state ekle**

Üst import'lardan `fileInputClass` sabitini kaldır (dosya içinde tanımlı; artık kullanılmayacak). Ekle:

```tsx
import { FilePicker } from "./FilePicker";
```

`ClarificationForm` içinde `formRef` satırından sonra ekle:

```tsx
  const [files, setFiles] = useState<File[]>([]);
```

- [ ] **Step 2: Submit'te dosyaları append + başarıda temizle**

`handleSubmit` içinde `const fd = new FormData(formRef.current);` satırından sonra ekle:

```tsx
    for (const f of files) fd.append("files", f);
```

`formRef.current.reset();` satırından sonra ekle:

```tsx
      setFiles([]);
```

- [ ] **Step 3: Native dosya input'unu FilePicker ile değiştir**

`ClarificationForm`'daki `<input name="files" type="file" .../>` ve onu saran `<div className="mb-4">...</div>` bloğunu şununla değiştir:

```tsx
        <div className="mb-4">
          <FilePicker value={files} onChange={setFiles} disabled={submitting} />
          <p className="text-xs text-on-surface-variant mt-1">
            PNG, JPEG, WebP, GIF veya PDF · İsteğe bağlı
          </p>
        </div>
```

> NOT: `ClarificationForm` üstündeki `const fileInputClass = ...` artık kullanılmıyorsa kaldır (kullanılmayan değişken uyarısını önle). `inputClass` kalır (textarea kullanıyor).

- [ ] **Step 4: Build + manuel doğrula**

Run: `bun run build`
Expected: hatasız.

Manuel: admin bir talepte "Netleştirme sorusu"na dosya ekleyip "Soru ekle" → soruya iliştirilmiş ek mesaj thread'inde görünür.

- [ ] **Step 5: Commit**

```bash
git add src/client/components/AdminControls.tsx
git commit -m "feat(client): wire FilePicker into admin clarification form"
```

---

## Faz D — Yıkıcı silmede onay dialogu

### Task D1: `ConfirmDialog` bileşeni

**Files:**
- Create: `src/client/components/ConfirmDialog.tsx`
- Test: `src/client/components/ConfirmDialog.test.tsx`

- [ ] **Step 1: Failing test yaz**

`src/client/components/ConfirmDialog.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmDialog } from "./ConfirmDialog";

test("open ConfirmDialog renders title, message and labels", () => {
  const html = renderToStaticMarkup(
    <ConfirmDialog
      open
      onOpenChange={() => {}}
      title="Sil?"
      message="«ERP» silinsin mi?"
      confirmLabel="Sil"
      onConfirm={() => {}}
    />,
  );
  expect(html).toContain("Sil?");
  expect(html).toContain("«ERP» silinsin mi?");
  expect(html).toContain("İptal");
});
```

> NOT: Radix Dialog içeriğini Portal'a basar; `renderToStaticMarkup` ile `open` iken içerik string'e gelir. Gelmezse testi yalnız `confirmLabel`/başlık metnini içeren minimal kontrolle sınırla.

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `bun test src/client/components/ConfirmDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Bileşeni yaz**

`src/client/components/ConfirmDialog.tsx`:

```tsx
// src/client/components/ConfirmDialog.tsx
// Reusable destructive-action confirmation built on the shadcn/Radix Dialog.
import { Dialog, DialogContent, DialogTitle, DialogClose } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "Sil",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-base font-semibold text-on-surface mb-2">
          {title}
        </DialogTitle>
        <p className="text-sm text-on-surface-variant mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="secondary" size="sm">
              İptal
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

> NOT: `Button` varyantları `primary/secondary/success/danger` mevcut ve `DialogTitle` `className` kabul ediyor (bkz. `AdminControls.tsx` kullanımı) — bu bileşen olduğu gibi geçerlidir.

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `bun test src/client/components/ConfirmDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/components/ConfirmDialog.tsx src/client/components/ConfirmDialog.test.tsx
git commit -m "feat(client): reusable ConfirmDialog"
```

---

### Task D2: ConfirmDialog'u Tanımlar silmelerine bağla

**Files:**
- Modify: `src/client/pages/Definitions.tsx`

- [ ] **Step 1: Import + tek bir confirm-state ekle**

İmport ekle:

```tsx
import { ConfirmDialog } from "../components/ConfirmDialog";
```

`DefinitionsInner()` içine state ekle:

```tsx
  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
```

- [ ] **Step 2: Silme tetikleyicilerini dialogtan geçir**

`DeptCard`'a verilen `onDelDept`/`onDelModule` ve Uygulamalar `delApp` çağrılarını doğrudan silmek yerine `setConfirm(...)` ile sar. Üç sarmalayıcı yardımcı ekle (handler'ların yanına):

```tsx
  function askDelDept(d: Dept) {
    setConfirm({
      title: "Departmanı sil?",
      message: `«${d.name}» ve modülleri silinsin mi? Geçmiş talepler etkilenmez.`,
      onConfirm: () => delDept(d.id),
    });
  }
  function askDelModule(deptName: string, m: { id: number; name: string }) {
    setConfirm({
      title: "Modülü sil?",
      message: `«${deptName} › ${m.name}» silinsin mi? Geçmiş talepler etkilenmez.`,
      onConfirm: () => delModule(m.id),
    });
  }
  function askDelApp(a: { id: number; name: string }) {
    setConfirm({
      title: "Uygulamayı sil?",
      message: `«${a.name}» silinsin mi? Geçmiş talepler etkilenmez.`,
      onConfirm: () => delApp(a.id),
    });
  }
```

`<DeptCard ... onDelDept={delDept} onDelModule={delModule} />` prop'larını ad+nesne taşıyacak imzaya çevir:
- `DeptCard` prop tiplerini `onDelDept: (d: Dept) => void` ve `onDelModule: (deptName: string, m: { id: number; name: string }) => void` yap.
- `DeptCard` içinde "Sil" butonu `onClick={() => onDelDept(d)}`; modül ✕ `onClick={() => onDelModule(d.name, m)}`.
- Çağrı yerinde: `<DeptCard ... onDelDept={askDelDept} onDelModule={askDelModule} ... />`.

Uygulamalar kartındaki çip ✕ `onClick={() => delApp(a.id)}` → `onClick={() => askDelApp(a)}`.

- [ ] **Step 3: Dialog'u render et**

`<main>`'in en altına (kapanış `</main>`'dan hemen önce) ekle:

```tsx
      {confirm && (
        <ConfirmDialog
          open={!!confirm}
          onOpenChange={(o) => { if (!o) setConfirm(null); }}
          title={confirm.title}
          message={confirm.message}
          confirmLabel="Sil"
          onConfirm={confirm.onConfirm}
        />
      )}
```

- [ ] **Step 4: Build + manuel doğrula**

Run: `bun run build`
Expected: hatasız.

Manuel: departman/modül/uygulama ✕ → onay dialogu açılır; İptal → kapanır, silmez; Sil → siler, liste güncellenir.

- [ ] **Step 5: Commit**

```bash
git add src/client/pages/Definitions.tsx
git commit -m "feat(client): confirm dialog before destructive deletes in Tanımlar"
```

---

## Faz E — Toast + mobil + a11y

### Task E1: Toast bileşeni + provider/hook

**Files:**
- Create: `src/client/components/Toast.tsx`
- Test: `src/client/components/Toast.test.tsx`
- Modify: `src/client/app.tsx` (provider sarmalı)

- [ ] **Step 1: Failing test yaz**

`src/client/components/Toast.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ToastProvider } from "./Toast";

test("ToastProvider renders children", () => {
  const html = renderToStaticMarkup(
    <ToastProvider>
      <div>içerik</div>
    </ToastProvider>,
  );
  expect(html).toContain("içerik");
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `bun test src/client/components/Toast.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Bileşeni yaz**

`src/client/components/Toast.tsx`:

```tsx
// src/client/components/Toast.tsx
// Minimal success-toast: context + auto-dismiss viewport. No external lib.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Toast = { id: number; msg: string };
const ToastCtx = createContext<{ show: (msg: string) => void }>({ show: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const show = useCallback((msg: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-on-surface text-white text-sm rounded-lg px-4 py-2 shadow-lg"
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
```

> NOT: `setTimeout` testte çalışmaz (SSR), sorun değil — sadece `show` çağrılınca planlanır. `seq`/`useRef` deterministik (Math.random yok).

- [ ] **Step 4: Provider'ı app köküne sar**

`src/client/app.tsx` — `<BrowserRouter>`'ı `ToastProvider` ile sar (router içindeki tüm sayfalar `useToast`'a erişsin, navigasyonda toast korunsun):

```tsx
import { ToastProvider } from "./components/Toast";
// ...
    <ToastProvider>
      <BrowserRouter>
        {/* mevcut <Routes>... */}
      </BrowserRouter>
    </ToastProvider>
```

- [ ] **Step 5: Test + build doğrula**

Run: `bun test src/client/components/Toast.test.tsx && bun run build`
Expected: PASS + hatasız bundle.

- [ ] **Step 6: Commit**

```bash
git add src/client/components/Toast.tsx src/client/components/Toast.test.tsx src/client/app.tsx
git commit -m "feat(client): minimal toast provider + useToast"
```

---

### Task E2: Başarı toast'larını bağla

**Files:**
- Modify: `src/client/pages/NewRequest.tsx`, `src/client/components/ReplyForm.tsx`, `src/client/components/AdminControls.tsx`, `src/client/pages/Definitions.tsx`

- [ ] **Step 1: NewRequest — talep oluşturuldu**

Import + hook: `import { useToast } from "../components/Toast";` ve bileşen içinde `const toast = useToast();`. Başarılı oluşturmada (`navigate(\`/requests/${result.id}\`)` öncesi) ekle:

```tsx
        toast.show("Talebiniz oluşturuldu.");
```

- [ ] **Step 2: ReplyForm — cevap gönderildi**

`import { useToast } from "./Toast";` + `const toast = useToast();`. `onSuccess()` öncesi ekle:

```tsx
      toast.show("Cevabınız gönderildi.");
```

- [ ] **Step 3: AdminControls — karar/soru kaydedildi**

`src/client/components/AdminControls.tsx` üst import'larına ekle:

```tsx
import { useToast } from "./Toast";
```

`ClarificationForm` içinde `const formRef = useRef<HTMLFormElement>(null);` satırından sonra ekle:

```tsx
  const toast = useToast();
```

`ClarificationForm.handleSubmit` içinde `onDone();` satırından **önce** ekle:

```tsx
      toast.show("Soru eklendi.");
```

`DecisionForm` içinde `const [rejectOpen, setRejectOpen] = useState(false);` satırından sonra ekle:

```tsx
  const toast = useToast();
```

`DecisionForm.decide` içinde `onDone();` satırından **önce** ekle (kabul ve ret aynı yolu izler):

```tsx
      toast.show("Karar kaydedildi.");
```

- [ ] **Step 4: Definitions — ekle/sil**

`const toast = useToast();` ekle. `addDept`/`addApp` başarısında `toast.show("Eklendi.")`; `delDept`/`delModule`/`delApp` başarısında `toast.show("Silindi.")` (her `load()` çağrısının hemen öncesinde).

- [ ] **Step 5: Build + manuel doğrula**

Run: `bun run build`
Expected: hatasız.

Manuel: talep oluştur / cevapla / karar ver / tanım ekle-sil → sağ-altta ~3sn toast.

- [ ] **Step 6: Commit**

```bash
git add src/client/pages/NewRequest.tsx src/client/components/ReplyForm.tsx src/client/components/AdminControls.tsx src/client/pages/Definitions.tsx
git commit -m "feat(client): success toasts on create/reply/decision/definitions"
```

---

### Task E3: AdminLayout mobil sidebar

**Files:**
- Modify: `src/client/layouts/AdminLayout.tsx`

- [ ] **Step 1: Sidebar'ı responsive yap**

`AdminLayout`'taki `return (...)` JSX'ini şununla değiştir (dış sarmal `md:flex`; `<aside>` mobilde tam-genişlik üst bar, `md+`'de dikey sidebar; nav mobilde yatay):

```tsx
  return (
    <div className="min-h-screen bg-surface md:flex">
      <aside className="w-full md:w-60 shrink-0 bg-surface-tonal border-b md:border-b-0 md:border-r border-border-subtle flex flex-col md:min-h-screen">
        <div className="px-4 h-14 flex items-center border-b border-border-subtle">
          <span className="font-semibold text-primary tracking-tight text-sm leading-tight">
            Talep Portalı
            <span className="block text-on-surface-variant font-normal text-xs">
              Yönetim
            </span>
          </span>
        </div>
        <nav className="flex-1 p-3 flex flex-row md:flex-col gap-1 items-center md:items-stretch flex-wrap">
          <NavLink to="/admin" end className={sideLink}>
            Tüm Talepler
          </NavLink>
          <NavLink to="/admin/tanimlar" className={sideLink}>
            Tanımlar
          </NavLink>
          <div className="md:mt-auto md:pt-3 md:border-t border-border-subtle">
            <NavLink
              to="/my"
              className="block px-3 py-2 rounded text-sm text-secondary hover:bg-surface-container"
            >
              ← Çalışan alanı
            </NavLink>
          </div>
        </nav>
        <div className="p-3 border-t border-border-subtle flex items-center justify-between gap-2">
          <span className="text-xs text-on-surface-variant truncate">
            {user.name || user.email}
          </span>
          <form method="post" action="/logout">
            <button
              type="submit"
              className="text-xs font-medium text-secondary hover:text-on-surface"
            >
              Çıkış
            </button>
          </form>
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
```

> Amaç: dar ekranda içerik tam genişlik, sidebar üstte ince yatay nav. Sınıfları build sonrası tarayıcıda doğrula; `gap`/`items` ince ayarı gerekebilir.

- [ ] **Step 2: Build + manuel doğrula (dar ekran)**

Run: `bun run build`
Expected: hatasız.

Manuel (Playwright `browser_resize` ~390px veya tarayıcıyı daralt): `/admin` → sidebar üstte yatay; nav linkleri tıklanır; içerik tam genişlik. `md+`'de eski dikey sidebar korunur.

- [ ] **Step 3: Commit**

```bash
git add src/client/layouts/AdminLayout.tsx
git commit -m "feat(client): responsive admin sidebar on small screens"
```

---

## Faz F — Doğrulama & belge

### Task F1: Tam suite + uçtan uca tur + CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (§2 + §3/§4 notları)

- [ ] **Step 1: Tüm testler yeşil**

Run: `bun test`
Expected: PASS (192 + yeni testler), 0 fail.

- [ ] **Step 2: Build temiz**

Run: `bun run build`
Expected: hatasız bundle.

- [ ] **Step 3: Playwright uçtan uca tur**

Çalışan sunucuda (`.env`'deki PORT) imzalı session cookie ile: çalışan → `/yeni` (uygulama dropdown + FilePicker ile dosya) → talep oluştur (toast) → admin → soru sor (toast) → çalışan cevapla (FilePicker, toast) → admin karar (toast); `/admin/tanimlar` uygulama ekle/sil + onay dialogu; dar ekranda admin sidebar. Ekran görüntüleriyle doğrula, sonra geçici dosyaları temizle.

- [ ] **Step 4: CLAUDE.md güncelle**

`CLAUDE.md §2` tablosuna/açıklamasına ekle: `applications` tablosu (db/repo), `FilePicker`/`ConfirmDialog`/`Toast` bileşenleri (`src/client/components/`), Tanımlar'ın uygulama yönetimi. Gerekirse §1 yedek notu (uploads zaten var).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update working contract for applications + ux-polish components"
```

---

## Self-Review notları (plan yazarı)

- **Spec kapsamı:** §3.1 FilePicker → C1–C4 (Yeni Talep, Cevap, admin Netleştirme formlarının üçü de); §3.2 Applications → A1–A2 (backend), B1–B2 (client); §3.3 Tanımlar onay + uygulama bölümü → D1–D2 + B2; §3.4 toast/mobil/a11y → E1–E3. §5 test → her task TDD + F1. Tümü kapsandı.
- **Tip/ad tutarlılığı:** `Application`, `listApplications/createApplication/getApplication/deleteApplication`; route `/api/applications`, `/api/admin/applications`; client `apps`/`app`/`newApp`/`files`; `FilePicker({value,onChange,disabled})`, `formatBytes`; `ConfirmDialog({open,onOpenChange,title,message,confirmLabel,onConfirm})`; `ToastProvider`/`useToast().show`. Tüm task'larda aynı.
- **Doğrulanmış desenler:** `Button` varyantları `primary/secondary/success/danger`; `DialogTitle` `className` alıyor (AdminControls'ta kullanılıyor) → ConfirmDialog geçerli. Üç formun üçü de native `files` input'u + `new FormData(formRef)` kullanıyor → FilePicker'a çevrilirken hepsinde `for (const f of files) fd.append("files", f)` deseni; backend `collectFiles` değişmez.
- **Uygulama sırasında doğrulanacak tek varsayım:** `repo.test.ts` şema kurulum tarzı (openDb vs satıriçi `CREATE TABLE`) — A1 Step1/3'te iki yola da talimat var.
