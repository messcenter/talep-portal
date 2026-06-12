# Dosya/Resim Ekleri — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Talep ve cevap mesajlarına resim (PNG/JPEG/WebP/GIF) ve PDF ekleyebilmek; ekleri yetkili kullanıcıya geri sunmak.

**Architecture:** Saf domain doğrulaması (magic-byte sniff + limitler) + yeni `src/storage/` dosya sistemi katmanı (`Deps` ile enjekte). Route'lar multipart'ı parse eder → domain doğrular → diske yazar → metadata'yı talep/mesajla **atomik** kaydeder. Ayrı bir servis route'u dosyayı `canViewRequest` kontrolüyle geri sunar.

**Tech Stack:** Bun + Hono + `bun:sqlite`, Zod, server-side HTML. Build adımı yok.

**Spec:** `docs/superpowers/specs/2026-06-12-attachments-design.md`

**Hono doğrulaması (context7, hono.dev — 2026-06-12):**
- `c.req.parseBody({ all: true })`: aynı isimli alanları diziye toplar (`body['files']` → `(string|File)[]` veya tekil; `collectFiles` ikisini de normalize eder). `files[]` postfix'i her zaman dizi döndürür — alternatif, eşdeğer.
- Binary yanıt: `c.header('Content-Type', mime); return c.body(bytes)` resmi desen (doküman `image/png` örneği veriyor). `Uint8Array` geçerli gövde.
- `File.arrayBuffer()` ile byte okuma web-standard; Bun'da çalışır.

---

## Dosya yapısı

| Dosya | Sorumluluk | İşlem |
|---|---|---|
| `src/domain/attachments.ts` | saf doğrulama: sniff, limitler, key | Create |
| `src/domain/attachments.test.ts` | exhaustive birim test | Create |
| `src/storage/storage.ts` | dosya sistemi I/O (put/read/remove) | Create |
| `src/storage/storage.test.ts` | temp-dir roundtrip | Create |
| `src/routes/uploads.ts` | route yardımcısı: collectFiles + processUploads | Create |
| `src/config.ts` | `uploadDir` eklenir | Modify |
| `.env.example` | `UPLOAD_DIR` eklenir | Modify |
| `src/db/db.ts` | `attachments` tablosu migration | Modify |
| `src/db/repo.ts` | AttachmentRow/Input tipleri + repo metotları; createRequest/addMessageAndTransition ek param | Modify |
| `src/db/repo.test.ts` | ek CRUD + atomik testler | Modify |
| `src/app.ts` | `Deps.storage`; CSRF middleware `parseBody({ all: true })` + Content-Length guard; `body()` | Modify |
| `src/index.ts` | fs storage wiring | Modify |
| `src/views/views.ts` | form file input'ları + ek görüntüleme | Modify |
| `src/routes/public.ts` | yeni talep/cevap upload + servis route + detayda ek listesi | Modify |
| `src/routes/admin.ts` | admin mesaj upload + detayda ek listesi | Modify |
| `src/routes/public.test.ts` | storage dep + multipart upload + servis testleri | Modify |
| `src/routes/admin.test.ts` | storage dep + multipart upload testleri | Modify |
| `CLAUDE.md` | §1 yedek notu, §2 katman satırı, §8 maddesi | Modify |

---

## Task 1: Attachment domain logic

**Files:**
- Create: `src/domain/attachments.ts`
- Test: `src/domain/attachments.test.ts`

- [ ] **Step 1: Write the failing test**

`src/domain/attachments.test.ts`:
```ts
import { expect, test, describe } from "bun:test";
import {
  sniffMime, extForMime, validateUploads, storageKey,
  MAX_FILE_BYTES, MAX_FILES, type UploadMeta,
} from "./attachments";

const sig = (...bytes: number[]) => new Uint8Array(bytes);
const PNG = sig(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = sig(0xff, 0xd8, 0xff, 0xe0);
const GIF = sig(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
const WEBP = sig(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
const PDF = sig(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31);

const meta = (over: Partial<UploadMeta> = {}): UploadMeta =>
  ({ name: "f.png", size: 1000, head: PNG, ...over });

describe("sniffMime", () => {
  test("detects each allowed type by magic bytes", () => {
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(JPEG)).toBe("image/jpeg");
    expect(sniffMime(GIF)).toBe("image/gif");
    expect(sniffMime(WEBP)).toBe("image/webp");
    expect(sniffMime(PDF)).toBe("application/pdf");
  });
  test("returns null for unknown / empty", () => {
    expect(sniffMime(sig(0x00, 0x01, 0x02, 0x03))).toBeNull();
    expect(sniffMime(sig())).toBeNull();
  });
});

describe("extForMime", () => {
  test("maps mime to storage extension", () => {
    expect(extForMime("image/jpeg")).toBe("jpg");
    expect(extForMime("application/pdf")).toBe("pdf");
    expect(extForMime("text/plain")).toBeNull();
  });
});

describe("validateUploads", () => {
  test("accepts valid files and returns sniffed mimes", () => {
    const r = validateUploads([meta(), meta({ name: "d.pdf", head: PDF })]);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.mimes).toEqual(["image/png", "application/pdf"]);
  });
  test("rejects more than MAX_FILES", () => {
    const r = validateUploads(Array.from({ length: MAX_FILES + 1 }, () => meta()));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain(`${MAX_FILES}`);
  });
  test("rejects oversize file", () => {
    const r = validateUploads([meta({ size: MAX_FILE_BYTES + 1 })]);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("10 MB");
  });
  test("rejects empty file", () => {
    const r = validateUploads([meta({ size: 0 })]);
    expect(r.ok).toBe(false);
  });
  test("rejects unknown / spoofed type (extension lies, bytes don't match)", () => {
    const r = validateUploads([meta({ name: "evil.png", head: sig(0x4d, 0x5a, 0x90) })]);
    expect(r.ok).toBe(false);
    expect(r.mimes).toEqual([null]);
  });
});

describe("storageKey", () => {
  test("joins uuid and ext", () => {
    expect(storageKey("abc", "png")).toBe("abc.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/domain/attachments.test.ts`
Expected: FAIL — `Cannot find module './attachments'`.

- [ ] **Step 3: Write minimal implementation**

`src/domain/attachments.ts`:
```ts
// src/domain/attachments.ts — saf doğrulama, sıfır I/O.
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES = 10;

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

export function extForMime(mime: string): string | null {
  return MIME_EXT[mime] ?? null;
}

// Gerçek türü ilk byte'lardan tespit eder; client'ın gönderdiği MIME'a güvenmeyiz.
export function sniffMime(head: Uint8Array): string | null {
  const b = head;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38)
    return "image/gif";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  )
    return "image/webp";
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)
    return "application/pdf";
  return null;
}

export type UploadMeta = { name: string; size: number; head: Uint8Array };

export function validateUploads(files: UploadMeta[]): {
  ok: boolean;
  errors: string[];
  mimes: (string | null)[];
} {
  const errors: string[] = [];
  if (files.length > MAX_FILES)
    errors.push(`En fazla ${MAX_FILES} dosya yükleyebilirsiniz.`);
  const mimes: (string | null)[] = [];
  for (const f of files) {
    const mime = sniffMime(f.head);
    mimes.push(mime);
    if (f.size <= 0) {
      errors.push(`Boş dosya: ${f.name}`);
      continue;
    }
    if (f.size > MAX_FILE_BYTES) errors.push(`${f.name}: dosya 10 MB sınırını aşıyor.`);
    if (!mime) errors.push(`${f.name}: yalnızca PNG, JPEG, WebP, GIF ve PDF kabul edilir.`);
  }
  return { ok: errors.length === 0, errors, mimes };
}

export function storageKey(uuid: string, ext: string): string {
  return `${uuid}.${ext}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/domain/attachments.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/domain/attachments.ts src/domain/attachments.test.ts
git commit -m "feat: attachment validation domain (sniff, limits)"
```

---

## Task 2: Filesystem storage layer

**Files:**
- Create: `src/storage/storage.ts`
- Test: `src/storage/storage.test.ts`

- [ ] **Step 1: Write the failing test**

`src/storage/storage.test.ts`:
```ts
import { expect, test, describe, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeFsStorage } from "./storage";

let dirs: string[] = [];
async function tempDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "talep-store-"));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});

describe("makeFsStorage", () => {
  test("put then read returns the same bytes", async () => {
    const s = makeFsStorage(await tempDir());
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await s.put("a.png", bytes);
    expect(await s.read("a.png")).toEqual(bytes);
  });
  test("read of missing key returns null", async () => {
    const s = makeFsStorage(await tempDir());
    expect(await s.read("nope.png")).toBeNull();
  });
  test("remove deletes the file; removing missing is a no-op", async () => {
    const s = makeFsStorage(await tempDir());
    await s.put("b.pdf", new Uint8Array([9]));
    await s.remove("b.pdf");
    expect(await s.read("b.pdf")).toBeNull();
    await s.remove("b.pdf"); // does not throw
  });
  test("creates root dir if missing", async () => {
    const root = join(await tempDir(), "nested", "uploads");
    const s = makeFsStorage(root);
    await s.put("c.gif", new Uint8Array([7]));
    expect(await s.read("c.gif")).toEqual(new Uint8Array([7]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/storage/storage.test.ts`
Expected: FAIL — `Cannot find module './storage'`.

- [ ] **Step 3: Write minimal implementation**

`src/storage/storage.ts`:
```ts
// src/storage/storage.ts — dosya sistemi I/O. Deps ile enjekte edilir.
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

export interface Storage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array | null>;
  remove(key: string): Promise<void>;
}

export function makeFsStorage(rootDir: string): Storage {
  return {
    async put(key, bytes) {
      await mkdir(rootDir, { recursive: true });
      await writeFile(join(rootDir, key), bytes);
    },
    async read(key) {
      try {
        return new Uint8Array(await readFile(join(rootDir, key)));
      } catch (e: any) {
        if (e?.code === "ENOENT") return null;
        throw e;
      }
    },
    async remove(key) {
      try {
        await unlink(join(rootDir, key));
      } catch (e: any) {
        if (e?.code !== "ENOENT") throw e;
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/storage/storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/storage.ts src/storage/storage.test.ts
git commit -m "feat: filesystem storage layer"
```

---

## Task 3: Config — UPLOAD_DIR

**Files:**
- Modify: `src/config.ts` (schema + loadConfig)
- Modify: `.env.example`

- [ ] **Step 1: Write the failing test**

Append to `src/config.test.ts` if it exists; otherwise create `src/config.test.ts`:
```ts
import { expect, test } from "bun:test";
import { loadConfig } from "./config";

const base = {
  APP_BASE_URL: "http://localhost:3000",
  SESSION_SECRET: "test-secret-16chars-min",
  GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec",
  GOOGLE_HOSTED_DOMAIN: "kokilmetal.com.tr",
  ADMIN_EMAILS: "boss@kokilmetal.com.tr",
  SMTP_HOST: "smtp.zoho.com", SMTP_PORT: "465", SMTP_SECURE: "true",
  MAIL_FROM: "From <f@k.com>",
};

test("uploadDir defaults to 'uploads'", () => {
  expect(loadConfig(base).uploadDir).toBe("uploads");
});
test("uploadDir reads UPLOAD_DIR", () => {
  expect(loadConfig({ ...base, UPLOAD_DIR: "/data/up" }).uploadDir).toBe("/data/up");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/config.test.ts`
Expected: FAIL — `uploadDir` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/config.ts`, add to `ConfigSchema` (after `dbPath`):
```ts
  dbPath: z.string().default("data.db"),
  uploadDir: z.string().default("uploads"),
});
```
And in `loadConfig`'s parsed object (after `dbPath: env.DB_PATH,`):
```ts
    dbPath: env.DB_PATH,
    uploadDir: env.UPLOAD_DIR,
```

In `.env.example`, add a line after `DB_PATH=data.db`:
```
UPLOAD_DIR=uploads
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts .env.example src/config.test.ts
git commit -m "feat: UPLOAD_DIR config"
```

---

## Task 4: DB schema + repo for attachments

**Files:**
- Modify: `src/db/db.ts` (migration)
- Modify: `src/db/repo.ts` (types + methods + extend createRequest / addMessageAndTransition)
- Modify: `src/db/repo.test.ts` (schema helper + tests)

- [ ] **Step 1: Write the failing test**

First, find the schema-creation block in `src/db/repo.test.ts` (it builds `requests` and `messages` tables). Add the `attachments` table to that block so the in-memory DB has it. Then append these tests:
```ts
describe("attachments", () => {
  const att = (over = {}) => ({
    storage_key: "k1.png", original_name: "shot.png",
    mime: "image/png", size_bytes: 123, ...over,
  });

  test("createRequest stores request-level attachments (message_id null)", () => {
    const r = repo.createRequest(sample, "t", [att(), att({ storage_key: "k2.pdf", mime: "application/pdf" })]);
    const list = repo.listAttachmentsByRequest(r.id);
    expect(list.length).toBe(2);
    expect(list[0]!.request_id).toBe(r.id);
    expect(list[0]!.message_id).toBeNull();
  });

  test("addMessageAndTransition attaches files to the new message", () => {
    const r = repo.createRequest(sample, "t");
    repo.updateStatus(r.id, "clarifying");
    repo.addMessageAndTransition(
      r.id, { role: "requester", body: "cevap" }, "answered", "t",
      [att({ storage_key: "k3.png" })],
    );
    const list = repo.listAttachmentsByRequest(r.id);
    expect(list.length).toBe(1);
    expect(list[0]!.message_id).not.toBeNull();
  });

  test("getAttachment returns row or null", () => {
    const r = repo.createRequest(sample, "t", [att()]);
    const id = repo.listAttachmentsByRequest(r.id)[0]!.id;
    expect(repo.getAttachment(id)?.storage_key).toBe("k1.png");
    expect(repo.getAttachment(999999)).toBeNull();
  });
});
```
> Note: `sample` must exist in `repo.test.ts`. If the file uses a different fixture name for a valid `CreateRequestInput`, reuse that name instead.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/db/repo.test.ts`
Expected: FAIL — `listAttachmentsByRequest is not a function` (and/or no `attachments` table).

- [ ] **Step 3: Write minimal implementation**

In `src/db/db.ts`, inside `migrate()`'s `db.exec(\`...\`)`, append after the messages index:
```sql
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id),
      message_id INTEGER REFERENCES messages(id),
      storage_key TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_request ON attachments(request_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
```

Add the same `CREATE TABLE attachments` + indexes to the `schema()` helper in `src/db/repo.test.ts` (and later to the route test files — see Task 5/6).

In `src/db/repo.ts`, add types after `MessageRow`:
```ts
export type AttachmentInput = {
  storage_key: string;
  original_name: string;
  mime: string;
  size_bytes: number;
};

export type AttachmentRow = AttachmentInput & {
  id: number;
  request_id: number;
  message_id: number | null;
  created_at: string;
};
```

Inside `makeRepo`, add a private insert helper at the top of the returned-object scope (just before `return {`):
```ts
  const insertAttachments = (
    requestId: number,
    messageId: number | null,
    attachments: AttachmentInput[],
    createdAt: string,
  ) => {
    for (const a of attachments) {
      db.query(
        `INSERT INTO attachments
         (request_id, message_id, storage_key, original_name, mime, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(requestId, messageId, a.storage_key, a.original_name, a.mime, a.size_bytes, createdAt);
    }
  };
```

Extend `createRequest` to accept attachments and insert them in the same tx. Replace its signature/return:
```ts
    createRequest(
      input: CreateRequestInput,
      createdAt: string,
      attachments: AttachmentInput[] = [],
    ): RequestRow {
      const tx = db.transaction(() => {
        const row = db
          .query<{ c: number }, []>("SELECT COUNT(*) AS c FROM requests")
          .get()!;
        const requestNo = formatRequestNo(row.c + 1);
        const inserted = db
          .query<RequestRow, any>(
            `INSERT INTO requests
             (request_no, created_at, requester_name, requester_email,
              department, application, module_area, request_type, title,
              description, expected_benefit, priority, status)
             VALUES ($no,$at,$name,$email,$dept,$app,$mod,$type,$title,
                     $desc,$benefit,$prio,'new')
             RETURNING *`,
          )
          .get({
            $no: requestNo, $at: createdAt,
            $name: input.requester_name, $email: input.requester_email,
            $dept: input.department, $app: input.application,
            $mod: input.module_area ?? "", $type: input.request_type,
            $title: input.title, $desc: input.description,
            $benefit: input.expected_benefit, $prio: input.priority,
          })!;
        insertAttachments(inserted.id, null, attachments, createdAt);
        return inserted;
      });
      return tx();
    },
```

Extend `addMessageAndTransition` to accept attachments (default `[]`) and attach to the inserted message:
```ts
    addMessageAndTransition(
      requestId: number,
      message: { role: "admin" | "requester"; body: string } | null,
      newStatus: RequestStatus,
      createdAt: string,
      attachments: AttachmentInput[] = [],
    ): void {
      const run = db.transaction(() => {
        const current = db
          .query<{ status: RequestStatus }, [number]>(
            "SELECT status FROM requests WHERE id = ?",
          )
          .get(requestId);
        if (!current) throw new Error(`request ${requestId} not found`);
        if (!canTransition(current.status, newStatus)) {
          throw new Error(`illegal transition ${current.status} -> ${newStatus}`);
        }
        let messageId: number | null = null;
        if (message) {
          const res = db.query(
            `INSERT INTO messages (request_id, author_role, body, created_at)
             VALUES (?, ?, ?, ?)`,
          ).run(requestId, message.role, message.body, createdAt);
          messageId = Number(res.lastInsertRowid);
        }
        db.query("UPDATE requests SET status = ? WHERE id = ?").run(newStatus, requestId);
        insertAttachments(requestId, messageId, attachments, createdAt);
      });
      run();
    },
```

Add two read methods (e.g. after `listMessages`):
```ts
    listAttachmentsByRequest(requestId: number): AttachmentRow[] {
      return db
        .query<AttachmentRow, [number]>(
          "SELECT * FROM attachments WHERE request_id = ? ORDER BY id ASC",
        )
        .all(requestId);
    },

    getAttachment(id: number): AttachmentRow | null {
      return (
        db
          .query<AttachmentRow, [number]>("SELECT * FROM attachments WHERE id = ?")
          .get(id) ?? null
      );
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/db/repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/db.ts src/db/repo.ts src/db/repo.test.ts
git commit -m "feat: attachments table and repo methods"
```

---

## Task 5: Wire storage into Deps, CSRF multipart, index

**Files:**
- Modify: `src/app.ts` (Deps.storage, CSRF middleware, `body()`)
- Modify: `src/index.ts` (fs storage)
- Modify: `src/routes/public.test.ts`, `src/routes/admin.test.ts` (fake storage + attachments table in schema)

This task changes the `Deps` type, so every `buildApp(...)` call must pass `storage`. Update index + both route test files in the same commit to keep the suite green.

- [ ] **Step 1: Write the failing test**

In `src/routes/public.test.ts`, add a memory-storage helper and the attachments table, then a guard test. After the imports add:
```ts
import type { Storage } from "../storage/storage";

function makeMemStorage(): { store: Map<string, Uint8Array>; storage: Storage } {
  const store = new Map<string, Uint8Array>();
  return {
    store,
    storage: {
      async put(k, b) { store.set(k, b); },
      async read(k) { return store.get(k) ?? null; },
      async remove(k) { store.delete(k); },
    },
  };
}
```
Add the `attachments` table to the `schema()` helper's `db.exec(...)`:
```sql
    CREATE TABLE attachments (id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id),
      message_id INTEGER REFERENCES messages(id),
      storage_key TEXT NOT NULL, original_name TEXT NOT NULL,
      mime TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL);
```
Change the module-level state and `beforeEach` to hold storage:
```ts
let mem: ReturnType<typeof makeMemStorage>;
```
and inside `beforeEach`, before `app = buildApp(...)`:
```ts
  mem = makeMemStorage();
```
and add `storage: mem.storage` to the `buildApp({...})` deps object.

Add a sanity test:
```ts
test("buildApp wires storage dependency", () => {
  expect(mem.store.size).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/routes/public.test.ts`
Expected: FAIL — TypeScript error: `storage` missing in `Deps` (type) / property does not exist. (Until `app.ts` adds it.)

- [ ] **Step 3: Write minimal implementation**

In `src/app.ts`:
- Add import: `import type { Storage } from "./storage/storage";`
- Add to `Deps`:
```ts
export type Deps = {
  config: Config;
  repo: Repo;
  mailer: Mailer;
  storage: Storage;
  now: () => string; // ISO timestamp; injectable for tests
};
```
- Add a constant near `SESSION_MAX_AGE`:
```ts
// Upper bound for a multipart upload request body (10×10MB files + form payload).
export const MAX_UPLOAD_BYTES = 110 * 1024 * 1024;
```
- Replace the CSRF block (the `if (c.req.method === "POST" && path !== "/logout") { ... }`):
```ts
    if (c.req.method === "POST" && path !== "/logout") {
      const len = Number(c.req.header("content-length") ?? "0");
      if (Number.isFinite(len) && len > MAX_UPLOAD_BYTES)
        return c.text("Yükleme çok büyük", 413);
      const form = await c.req.parseBody({ all: true });
      const sent = form["_csrf"];
      if (sent !== csrf) return c.text("CSRF doğrulaması başarısız", 403);
      (c.req as any)._parsedBody = form;
    }
```
- Update the `body()` helper to also parse with `{ all: true }`:
```ts
export async function body(c: any): Promise<Record<string, any>> {
  return (c.req as any)._parsedBody ?? (await c.req.parseBody({ all: true }));
}
```

In `src/index.ts`:
- Add import: `import { makeFsStorage } from "./storage/storage";`
- Add before `buildApp`: `const storage = makeFsStorage(config.uploadDir);`
- Add `storage,` to the `buildApp({...})` object.

In `src/routes/admin.test.ts`: apply the SAME three edits as public.test.ts — `makeMemStorage` helper + `Storage` import, the `attachments` table in `schema()`, and `mem = makeMemStorage()` + `storage: mem.storage` in `beforeEach`/`buildApp`.

- [ ] **Step 4: Run the full suite**

Run: `bun test`
Expected: PASS (all existing + new). No `Deps`/storage type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app.ts src/index.ts src/routes/public.test.ts src/routes/admin.test.ts
git commit -m "feat: inject storage dep, multipart-aware CSRF parsing"
```

---

## Task 6: Upload on new request

**Files:**
- Create: `src/routes/uploads.ts`
- Modify: `src/views/views.ts` (`newRequestForm` adds file input + multipart)
- Modify: `src/routes/public.ts` (`POST /requests`)
- Modify: `src/routes/public.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/routes/public.test.ts` add inside `describe("POST /requests")`:
```ts
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

test("multipart upload stores attachment row and file bytes", async () => {
  const fd = new FormData();
  fd.append("_csrf", "test-csrf");
  fd.append("department", "Satın alma");
  fd.append("application", "ERP");
  fd.append("module_area", "");
  fd.append("request_type", "feature");
  fd.append("priority", "high");
  fd.append("title", "Kalıp modülü");
  fd.append("description", "detay");
  fd.append("expected_benefit", "fayda");
  fd.append("files", new File([PNG_BYTES], "shot.png", { type: "image/png" }));
  const res = await app.request("/requests", {
    method: "POST",
    headers: { Cookie: cookie("a@kokilmetal.com.tr", "A") },
    body: fd,
  });
  expect(res.status).toBe(302);
  const all = repo.listAll({});
  const atts = repo.listAttachmentsByRequest(all[0]!.id);
  expect(atts.length).toBe(1);
  expect(atts[0]!.mime).toBe("image/png");
  expect(mem.store.get(atts[0]!.storage_key)).toEqual(PNG_BYTES);
});

test("rejects a spoofed file type with 400 and stores nothing", async () => {
  const fd = new FormData();
  fd.append("_csrf", "test-csrf");
  fd.append("department", "d");
  fd.append("application", "ERP");
  fd.append("request_type", "feature");
  fd.append("priority", "high");
  fd.append("title", "t");
  fd.append("description", "d");
  fd.append("expected_benefit", "f");
  fd.append("files", new File([new Uint8Array([0x4d, 0x5a, 0x90])], "x.png", { type: "image/png" }));
  const res = await app.request("/requests", {
    method: "POST",
    headers: { Cookie: cookie("a@kokilmetal.com.tr", "A") },
    body: fd,
  });
  expect(res.status).toBe(400);
  expect(repo.listAll({}).length).toBe(0);
  expect(mem.store.size).toBe(0);
});
```
Also extend the existing render test to assert the form is multipart and has a file input:
```ts
test("new-request form is multipart with a file input", async () => {
  const res = await app.request("/", { headers: { Cookie: cookie("a@kokilmetal.com.tr", "A") } });
  const html = await res.text();
  expect(html).toContain('enctype="multipart/form-data"');
  expect(html).toContain('type="file"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/routes/public.test.ts`
Expected: FAIL — no `enctype`/file input; uploads not persisted.

- [ ] **Step 3: Write minimal implementation**

Create `src/routes/uploads.ts`:
```ts
// src/routes/uploads.ts — multipart dosyalarını toplar, doğrular, diske yazar.
import { randomUUID } from "node:crypto";
import {
  validateUploads, extForMime, storageKey, type UploadMeta,
} from "../domain/attachments";
import type { Storage } from "../storage/storage";
import type { AttachmentInput } from "../db/repo";

// Hono parseBody({ all: true }): tek dosya File, çoklu dosya File[]. Normalize et.
export function collectFiles(form: Record<string, any>): File[] {
  const raw = form["files"];
  const arr = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  return arr.filter((f): f is File => f instanceof File && f.size > 0);
}

export type UploadResult =
  | { ok: true; attachments: AttachmentInput[] }
  | { ok: false; errors: string[] };

export async function processUploads(
  files: File[],
  storage: Storage,
): Promise<UploadResult> {
  if (files.length === 0) return { ok: true, attachments: [] };
  const buffers = await Promise.all(
    files.map(async (f) => new Uint8Array(await f.arrayBuffer())),
  );
  const metas: UploadMeta[] = files.map((f, i) => ({
    name: f.name, size: f.size, head: buffers[i]!.subarray(0, 16),
  }));
  const v = validateUploads(metas);
  if (!v.ok) return { ok: false, errors: v.errors };

  const attachments: AttachmentInput[] = [];
  const written: string[] = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const mime = v.mimes[i]!;
      const ext = extForMime(mime)!;
      const key = storageKey(randomUUID(), ext);
      await storage.put(key, buffers[i]!);
      written.push(key);
      attachments.push({
        storage_key: key, original_name: files[i]!.name,
        mime, size_bytes: files[i]!.size,
      });
    }
  } catch (err) {
    await Promise.all(written.map((k) => storage.remove(k).catch(() => {})));
    throw err;
  }
  return { ok: true, attachments };
}

// DB transaction'ı başarısız olursa yazılmış dosyaları best-effort temizler.
export async function discardUploads(
  storage: Storage,
  attachments: AttachmentInput[],
): Promise<void> {
  await Promise.all(attachments.map((a) => storage.remove(a.storage_key).catch(() => {})));
}
```

In `src/views/views.ts`, update `newRequestForm`'s `<form>` opening tag to add `enctype` and add a file input as the first field after the `_csrf` line (the `_csrf` hidden input was added in the earlier CSRF fix). Replace the form opening + first field region:
```ts
    <form method="post" action="/requests" enctype="multipart/form-data" class="bg-white rounded-lg border p-6">
      <input type="hidden" name="_csrf" value="${esc(csrf)}">
      ${field("Departman", `<input ${input} name="department" required>`)}
```
And insert a file field just before the submit `<button>`:
```ts
      ${field(
        "Ekler (resim/PDF, en çok 10 dosya, 10 MB)",
        `<input type="file" name="files" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" class="block w-full text-sm">`,
      )}
      <button class="bg-slate-800 text-white px-5 py-2 rounded">Gönder</button>
```

In `src/routes/public.ts`:
- Add imports:
```ts
import { collectFiles, processUploads, discardUploads } from "./uploads";
```
- Replace the `POST /requests` handler body so it processes uploads. After the existing `parsed.success` validation passes and before `deps.repo.createRequest(...)`:
```ts
    const up = await processUploads(collectFiles(form), deps.storage);
    if (!up.ok) return c.html(newRequestForm(user, c.get("csrf"), up.errors), 400);
    let r;
    try {
      r = deps.repo.createRequest(
        { ...parsed.data, requester_name: user.name, requester_email: user.email },
        deps.now(),
        up.attachments,
      );
    } catch (err) {
      await discardUploads(deps.storage, up.attachments);
      throw err;
    }
```
  (Keep the existing `const form = await body(c);` line; reuse `form` for `collectFiles`. Keep the mail-sending loop and final `c.redirect` unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/routes/public.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/uploads.ts src/views/views.ts src/routes/public.ts src/routes/public.test.ts
git commit -m "feat: attach files when creating a request"
```

---

## Task 7: Upload on reply and admin message

**Files:**
- Modify: `src/views/views.ts` (`replyBox` + `adminBox` message form → multipart + file input)
- Modify: `src/routes/public.ts` (`POST /requests/:id/reply`)
- Modify: `src/routes/admin.ts` (`POST /admin/requests/:id/message`)
- Modify: `src/routes/public.test.ts`, `src/routes/admin.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/routes/public.test.ts` `describe("reply flow")`, add:
```ts
test("reply can carry an attachment", async () => {
  const r = repo.createRequest(
    { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
      department: "d", application: "ERP", module_area: "",
      request_type: "feature", title: "t", description: "d",
      expected_benefit: "f", priority: "high" },
    "t",
  );
  repo.updateStatus(r.id, "clarifying");
  const fd = new FormData();
  fd.append("_csrf", "test-csrf");
  fd.append("body", "cevabım ekte");
  fd.append("files", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "ek.pdf", { type: "application/pdf" }));
  const res = await app.request(`/requests/${r.id}/reply`, {
    method: "POST",
    headers: { Cookie: cookie("a@kokilmetal.com.tr", "A") },
    body: fd,
  });
  expect(res.status).toBe(302);
  const atts = repo.listAttachmentsByRequest(r.id);
  expect(atts.length).toBe(1);
  expect(atts[0]!.message_id).not.toBeNull();
  expect(atts[0]!.mime).toBe("application/pdf");
});
```

In `src/routes/admin.test.ts` `describe("admin message")`, add:
```ts
test("admin question can carry an attachment", async () => {
  const r = repo.createRequest(sample, "t");
  const fd = new FormData();
  fd.append("_csrf", "test-csrf");
  fd.append("body", "şu ekrana bakın");
  fd.append("files", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "q.png", { type: "image/png" }));
  const res = await app.request(`/admin/requests/${r.id}/message`, {
    method: "POST",
    headers: { Cookie: adminCookie() },
    body: fd,
  });
  expect(res.status).toBe(302);
  expect(repo.listAttachmentsByRequest(r.id).length).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/routes/public.test.ts src/routes/admin.test.ts`
Expected: FAIL — attachments not persisted on reply/message.

- [ ] **Step 3: Write minimal implementation**

In `src/views/views.ts`, update `replyBox` form tag and add a file input before its button:
```ts
    ? `<form method="post" action="/requests/${r.id}/reply" enctype="multipart/form-data" class="bg-white border rounded p-4 mt-4">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <textarea ${input} name="body" rows="3" placeholder="Cevabınız..." required></textarea>
        <input type="file" name="files" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" class="block w-full text-sm mt-2">
        <button class="bg-slate-800 text-white px-4 py-2 rounded mt-2">Cevapla</button>
      </form>`
```
And the admin message form (the first form in `adminBox`):
```ts
    ? `<form method="post" action="/admin/requests/${r.id}/message" enctype="multipart/form-data" class="bg-white border rounded p-4 mt-4">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <textarea ${input} name="body" rows="3" placeholder="Netleştirme sorusu..." required></textarea>
        <input type="file" name="files" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" class="block w-full text-sm mt-2">
        <button class="bg-slate-800 text-white px-4 py-2 rounded mt-2">Soru ekle</button>
      </form>`
```
(Leave the decision form unchanged — no attachments there.)

In `src/routes/public.ts` `POST /requests/:id/reply`, after `parsed.success` check, replace the `addMessageAndTransition` call with upload handling:
```ts
    const up = await processUploads(collectFiles(await body(c)), deps.storage);
    if (!up.ok) return c.text(up.errors.join(" "), 400);
    try {
      deps.repo.addMessageAndTransition(
        r.id, { role: "requester", body: parsed.data.body }, "answered",
        deps.now(), up.attachments,
      );
    } catch (err) {
      await discardUploads(deps.storage, up.attachments);
      throw err;
    }
```
(`processUploads`/`collectFiles`/`discardUploads` already imported in Task 6. `body(c)` returns the cached parsed body.)

In `src/routes/admin.ts`:
- Add import:
```ts
import { collectFiles, processUploads, discardUploads } from "./uploads";
```
- In `POST /admin/requests/:id/message`, after the `canTransition` 409 check, replace the `addMessageAndTransition` call:
```ts
    const up = await processUploads(collectFiles(await body(c)), deps.storage);
    if (!up.ok) return c.text(up.errors.join(" "), 400);
    try {
      deps.repo.addMessageAndTransition(
        r.id, { role: "admin", body: parsed.data.body }, "clarifying",
        deps.now(), up.attachments,
      );
    } catch (err) {
      await discardUploads(deps.storage, up.attachments);
      throw err;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/routes/public.test.ts src/routes/admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/views.ts src/routes/public.ts src/routes/admin.ts src/routes/public.test.ts src/routes/admin.test.ts
git commit -m "feat: attach files on reply and admin question"
```

---

## Task 8: Serve route (download/view with authz)

**Files:**
- Modify: `src/routes/public.ts` (`GET /requests/:id/attachments/:attId`)
- Modify: `src/routes/public.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/routes/public.test.ts`, add:
```ts
describe("serve attachment", () => {
  async function seedWithAttachment() {
    const r = repo.createRequest(
      { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "t", description: "d",
        expected_benefit: "f", priority: "high" },
      "t",
      [{ storage_key: "img1.png", original_name: "shot.png", mime: "image/png", size_bytes: 3 }],
    );
    mem.store.set("img1.png", new Uint8Array([1, 2, 3]));
    return { r, att: repo.listAttachmentsByRequest(r.id)[0]! };
  }

  test("owner can fetch their attachment with correct headers", async () => {
    const { r, att } = await seedWithAttachment();
    const res = await app.request(`/requests/${r.id}/attachments/${att.id}`, {
      headers: { Cookie: cookie("a@kokilmetal.com.tr", "A") },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  test("stranger gets 404 (no leakage)", async () => {
    const { r, att } = await seedWithAttachment();
    const res = await app.request(`/requests/${r.id}/attachments/${att.id}`, {
      headers: { Cookie: cookie("intruder@kokilmetal.com.tr", "X") },
    });
    expect(res.status).toBe(404);
  });

  test("missing attachment id gives 404", async () => {
    const res = await app.request(`/requests/1/attachments/999999`, {
      headers: { Cookie: cookie("a@kokilmetal.com.tr", "A") },
    });
    expect(res.status).toBe(404);
  });
});
```
> `cookie("intruder@...")` is a valid hosted-domain session but not the request owner and not admin, so `canViewRequest` denies → 404.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/routes/public.test.ts`
Expected: FAIL — route not defined (404 for owner too, header assertions fail).

- [ ] **Step 3: Write minimal implementation**

In `src/routes/public.ts`, add this route inside `registerPublicRoutes` (e.g. after `GET /requests/:id`):
```ts
  app.get("/requests/:id/attachments/:attId", async (c) => {
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    const attId = Number(c.req.param("attId"));
    if (!Number.isInteger(id) || !Number.isInteger(attId))
      return c.text("Bulunamadı", 404);
    const att = deps.repo.getAttachment(attId);
    if (!att || att.request_id !== id) return c.text("Bulunamadı", 404);
    const r = deps.repo.getRequest(att.request_id);
    if (!r || !canViewRequest(user, r)) return c.text("Bulunamadı", 404);
    const bytes = await deps.storage.read(att.storage_key);
    if (!bytes) return c.text("Bulunamadı", 404);
    const safeName = att.original_name.replace(/[\r\n"\\]/g, "_");
    c.header("Content-Type", att.mime);
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Content-Disposition", `inline; filename="${safeName}"`);
    c.header("Cache-Control", "private, max-age=300");
    return c.body(bytes);
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/routes/public.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/public.ts src/routes/public.test.ts
git commit -m "feat: serve attachments with authz and nosniff"
```

---

## Task 9: Display attachments in request detail

**Files:**
- Modify: `src/views/views.ts` (`attachmentChips`, `thread`, `requestDetail`)
- Modify: `src/routes/public.ts` (`GET /requests/:id` passes attachments)
- Modify: `src/routes/admin.ts` (`GET /admin/requests/:id` passes attachments)
- Modify: `src/routes/public.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/routes/public.test.ts`, add:
```ts
test("request detail shows an image thumbnail and a pdf link", async () => {
  const r = repo.createRequest(
    { requester_name: "A", requester_email: "a@kokilmetal.com.tr",
      department: "d", application: "ERP", module_area: "",
      request_type: "feature", title: "t", description: "d",
      expected_benefit: "f", priority: "high" },
    "t",
    [
      { storage_key: "p.png", original_name: "ekran.png", mime: "image/png", size_bytes: 3 },
      { storage_key: "d.pdf", original_name: "sartname.pdf", mime: "application/pdf", size_bytes: 4 },
    ],
  );
  const res = await app.request(`/requests/${r.id}`, {
    headers: { Cookie: cookie("a@kokilmetal.com.tr", "A") },
  });
  const html = await res.text();
  expect(html).toContain(`<img src="/requests/${r.id}/attachments/`);
  expect(html).toContain("sartname.pdf");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/routes/public.test.ts`
Expected: FAIL — no `<img>`/pdf link in detail HTML.

- [ ] **Step 3: Write minimal implementation**

In `src/views/views.ts`:
- Add import of the attachment type:
```ts
import type { RequestRow, MessageRow, AttachmentRow } from "../db/repo";
```
- Add an `attachmentChips` helper (e.g. above `thread`):
```ts
export function attachmentChips(requestId: number, atts: AttachmentRow[]): string {
  if (!atts.length) return "";
  const items = atts
    .map((a) => {
      const url = `/requests/${requestId}/attachments/${a.id}`;
      if (a.mime.startsWith("image/")) {
        return `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${esc(a.original_name)}" class="h-24 w-24 object-cover border rounded"></a>`;
      }
      return `<a href="${url}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 border rounded px-3 py-2 text-sm bg-white hover:bg-slate-50">📄 ${esc(a.original_name)}</a>`;
    })
    .join("");
  return `<div class="flex flex-wrap gap-3 mt-2">${items}</div>`;
}
```
- Change `thread` to accept attachments-by-message and the request id:
```ts
export function thread(
  messages: MessageRow[],
  attByMessage: Map<number, AttachmentRow[]>,
  requestId: number,
): string {
  if (!messages.length)
    return `<p class="text-slate-500 text-sm">Henüz mesaj yok.</p>`;
  return messages
    .map((m) => {
      const isAdmin = m.author_role === "admin";
      return `<div class="mb-3 ${isAdmin ? "" : "pl-8"}">
        <div class="text-xs text-slate-400 mb-1">${isAdmin ? "Yönetici (soru)" : "Talep eden (cevap)"} · ${esc(m.created_at)}</div>
        <div class="bg-white border rounded p-3 whitespace-pre-wrap">${esc(m.body)}</div>
        ${attachmentChips(requestId, attByMessage.get(m.id) ?? [])}
      </div>`;
    })
    .join("");
}
```
- Update `requestDetail`: add `attachments: AttachmentRow[]` to opts, render request-level chips under `meta`, and pass grouped attachments to `thread`. In the opts type add:
```ts
  attachments: AttachmentRow[];
```
  Destructure it: `const { r, messages, canReply, isAdmin, csrf, user, attachments } = opts;`
  After building `meta`, insert grouping + request-level chips:
```ts
  const requestLevel = attachments.filter((a) => a.message_id == null);
  const byMessage = new Map<number, AttachmentRow[]>();
  for (const a of attachments) {
    if (a.message_id == null) continue;
    const list = byMessage.get(a.message_id) ?? [];
    list.push(a);
    byMessage.set(a.message_id, list);
  }
  const metaWithFiles = meta + attachmentChips(r.id, requestLevel);
```
  Then, wherever the function currently composes its body, use `metaWithFiles` in place of `meta` and call `thread(messages, byMessage, r.id)` instead of `thread(messages)`.
  > Read the existing tail of `requestDetail` (lines ~162+) to find the exact `thread(messages)` call and `meta` usage in the returned `layout(...)`, and update both references.

In `src/routes/public.ts` `GET /requests/:id`, add `attachments` to the `requestDetail({...})` call:
```ts
        isAdmin: user.isAdmin,
        csrf: c.get("csrf"),
        attachments: deps.repo.listAttachmentsByRequest(r.id),
```

In `src/routes/admin.ts` `GET /admin/requests/:id`, add the same line to its `requestDetail({...})` call:
```ts
        isAdmin: true,
        csrf: c.get("csrf"),
        attachments: deps.repo.listAttachmentsByRequest(r.id),
```

- [ ] **Step 4: Run the full suite**

Run: `bun test`
Expected: PASS. (Confirms `thread`/`requestDetail` signature changes didn't break other callers.)

- [ ] **Step 5: Commit**

```bash
git add src/views/views.ts src/routes/public.ts src/routes/admin.ts src/routes/public.test.ts
git commit -m "feat: render attachments in request detail"
```

---

## Task 10: Contract / docs updates

**Files:**
- Modify: `CLAUDE.md` (§1, §2, §8)

- [ ] **Step 1: Update CLAUDE.md**

- §1: change the backup line to:
  > Tek process, tek `data.db` dosyası. **Yedek = `data.db` dosyasını ve `uploads/` klasörünü birlikte kopyala.**
- §2 layer table: add a row after `src/mail/`:
  > | `src/storage/` | dosya sistemi ek I/O (put/read/remove) | `Deps` ile enjekte; domain'e sızma |
- §8: remove the `- Görsel/dosya ekleri.` bullet from the "Şu An Dışı" list (now implemented).

- [ ] **Step 2: Verify the whole suite is green**

Run: `bun test`
Expected: PASS, 0 fail.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: move attachments into scope; update backup + layering"
```

---

## Tamamlanma kontrol listesi

- [ ] `bun test` tamamen yeşil (0 fail).
- [ ] Yeni talep, cevap ve admin sorusu formlarında dosya yüklenebiliyor.
- [ ] Yüklenen dosyalar yalnızca talebi görebilen kullanıcıya servis ediliyor (yabancı → 404).
- [ ] Sahte tür (uzantı/içerik uyuşmazlığı) ve aşırı boyut reddediliyor; hiçbir dosya yazılmıyor.
- [ ] CLAUDE.md sözleşmesi güncellendi (§1, §2, §8).
- [ ] Sonraki tur: **UI makyajı** (ayrı spec/plan).
```
