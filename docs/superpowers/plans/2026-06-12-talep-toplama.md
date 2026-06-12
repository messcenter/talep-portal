# Talep Toplama & Netleştirme Portalı — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Çalışanların ERP/yazılım taleplerini toplayan, her talebi elle yazılan netleştirme soruları ile kabul/ret kararına kadar olgunlaştıran, Google ile giriş yapılan tek-process bir web portalı.

**Architecture:** Tek Bun process. Saf iş mantığı (durum makinesi, yetki, validation, numara) zero-I/O modüllerde; route handler'lar ince adapter. Veri tek dosya SQLite (`bun:sqlite`). Sunucu-tarafı render edilen HTML (Tailwind CDN), frontend build adımı yok. Giriş Google OAuth (hosted-domain kısıtlı), giden mail Zoho SMTP.

**Tech Stack:** Bun, Hono, bun:sqlite, Zod, nodemailer, Google OAuth2 (manuel, harici kütüphane yok), Tailwind (CDN). Test: `bun test`.

**Design ref:** `docs/superpowers/specs/2026-06-12-talep-toplama-design.md`

**Status slug sözleşmesi (load-bearing — tüm task'lar buna uyar):** Kod/DB'de İngilizce ascii slug, UI'da Türkçe label.

| slug (kod/DB) | UI label (TR) |
|---|---|
| `new` | Yeni |
| `clarifying` | Netleştiriliyor |
| `answered` | Cevaplandı |
| `accepted` | Kabul edildi |
| `rejected` | Reddedildi |

---

## File Structure

```
talep-portal/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── src/
│   ├── index.ts                # entry: config yükle, app kur, server başlat
│   ├── app.ts                  # Hono app fabrikası (route'ları bağlar)
│   ├── config.ts               # env yükleme + Zod doğrulama
│   ├── domain/                 # saf mantık (zero I/O)
│   │   ├── status.ts           # RequestStatus + geçiş kuralları + TR label
│   │   ├── status.test.ts
│   │   ├── request-no.ts       # request_no biçimleme
│   │   ├── request-no.test.ts
│   │   ├── validation.ts       # Zod şemaları (form girdileri)
│   │   ├── validation.test.ts
│   │   ├── authz.ts            # yetki kararları (saf)
│   │   └── authz.test.ts
│   ├── db/
│   │   ├── db.ts               # SQLite bağlantı + migration (tablo oluştur)
│   │   ├── repo.ts             # requests + messages veri erişimi
│   │   └── repo.test.ts        # in-memory SQLite entegrasyon
│   ├── auth/
│   │   ├── session.ts          # imzalı cookie oturum
│   │   ├── session.test.ts
│   │   ├── google.ts           # OAuth url + token verify (hd doğrulama)
│   │   └── google.test.ts
│   ├── mail/
│   │   ├── mailer.ts           # nodemailer wrapper (best-effort) + şablonlar
│   │   └── mailer.test.ts
│   ├── views/
│   │   └── views.ts            # HTML render fonksiyonları (layout + sayfalar)
│   └── routes/
│       ├── auth.ts             # /auth/google, /auth/google/callback, /logout
│       ├── auth.test.ts
│       ├── public.ts           # /, /requests, /my, /requests/:id, reply
│       ├── public.test.ts
│       ├── admin.ts            # /admin, /admin/requests/:id, message, decision
│       └── admin.test.ts
└── docs/superpowers/...
```

---

## Task 1: Proje iskeleti ve bağımlılıklar

**Files:**
- Create: `package.json`, `tsconfig.json`, `.env.example`

- [ ] **Step 1: package.json yaz**

```json
{
  "name": "talep-portal",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts",
    "test": "bun test"
  },
  "dependencies": {
    "hono": "^4.6.0",
    "nodemailer": "^6.9.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/nodemailer": "^6.4.0"
  }
}
```

- [ ] **Step 2: tsconfig.json yaz**

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "module": "ESNext",
    "target": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true
  }
}
```

- [ ] **Step 3: .env.example yaz**

```
PORT=3000
APP_BASE_URL=http://localhost:3000
SESSION_SECRET=change-me-32-bytes-min
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_HOSTED_DOMAIN=kokilmetal.com.tr
ADMIN_EMAILS=admin@kokilmetal.com.tr
SMTP_HOST=smtp.zoho.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
MAIL_FROM=Talep Portalı <talep@kokilmetal.com.tr>
DB_PATH=data.db
```

- [ ] **Step 4: Bağımlılıkları kur**

Run: `bun install`
Expected: `node_modules/` oluşur, hata yok.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .env.example bun.lockb
git commit -m "chore: project scaffold and dependencies"
```

---

## Task 2: Config yükleme (env + Zod)

**Files:**
- Create: `src/config.ts`

- [ ] **Step 1: Config şemasını ve yükleyiciyi yaz**

```typescript
// src/config.ts
import { z } from "zod";

const ConfigSchema = z.object({
  port: z.coerce.number().int().positive().default(3000),
  appBaseUrl: z.string().url(),
  sessionSecret: z.string().min(16),
  googleClientId: z.string().min(1),
  googleClientSecret: z.string().min(1),
  googleHostedDomain: z.string().min(1),
  adminEmails: z
    .string()
    .transform((s) =>
      s
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  smtpHost: z.string().min(1),
  smtpPort: z.coerce.number().int().positive(),
  smtpSecure: z
    .string()
    .transform((s) => s === "true")
    .pipe(z.boolean()),
  smtpUser: z.string().default(""),
  smtpPass: z.string().default(""),
  mailFrom: z.string().min(1),
  dbPath: z.string().default("data.db"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined>): Config {
  return ConfigSchema.parse({
    port: env.PORT,
    appBaseUrl: env.APP_BASE_URL,
    sessionSecret: env.SESSION_SECRET,
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    googleHostedDomain: env.GOOGLE_HOSTED_DOMAIN,
    adminEmails: env.ADMIN_EMAILS ?? "",
    smtpHost: env.SMTP_HOST,
    smtpPort: env.SMTP_PORT,
    smtpSecure: env.SMTP_SECURE ?? "false",
    smtpUser: env.SMTP_USER,
    smtpPass: env.SMTP_PASS,
    mailFrom: env.MAIL_FROM,
    dbPath: env.DB_PATH,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/config.ts
git commit -m "feat: typed config loader with zod validation"
```

> Not: config testi Task 12+ entegrasyon testlerinde dolaylı kapsanır; saf parse mantığı Zod'un kendi garantisidir, ayrı birim test gerekmez.

---

## Task 3: Domain — durum makinesi

**Files:**
- Create: `src/domain/status.ts`
- Test: `src/domain/status.test.ts`

- [ ] **Step 1: Failing test yaz**

```typescript
// src/domain/status.test.ts
import { expect, test, describe } from "bun:test";
import {
  type RequestStatus,
  isTerminal,
  canTransition,
  statusLabelTr,
} from "./status";

describe("status state machine", () => {
  test("admin question moves new -> clarifying", () => {
    expect(canTransition("new", "clarifying")).toBe(true);
  });
  test("requester reply moves clarifying -> answered", () => {
    expect(canTransition("clarifying", "answered")).toBe(true);
  });
  test("admin re-question moves answered -> clarifying", () => {
    expect(canTransition("answered", "clarifying")).toBe(true);
  });
  test("accept allowed from any non-terminal", () => {
    expect(canTransition("new", "accepted")).toBe(true);
    expect(canTransition("clarifying", "accepted")).toBe(true);
    expect(canTransition("answered", "accepted")).toBe(true);
  });
  test("reject allowed from any non-terminal", () => {
    expect(canTransition("new", "rejected")).toBe(true);
    expect(canTransition("answered", "rejected")).toBe(true);
  });
  test("terminal statuses cannot transition out", () => {
    expect(isTerminal("accepted")).toBe(true);
    expect(isTerminal("rejected")).toBe(true);
    expect(canTransition("accepted", "clarifying")).toBe(false);
    expect(canTransition("rejected", "accepted")).toBe(false);
  });
  test("illegal: new -> answered (requester cannot reply before question)", () => {
    expect(canTransition("new", "answered")).toBe(false);
  });
  test("TR labels", () => {
    expect(statusLabelTr("new")).toBe("Yeni");
    expect(statusLabelTr("rejected")).toBe("Reddedildi");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/domain/status.test.ts`
Expected: FAIL — `Cannot find module './status'`.

- [ ] **Step 3: Implement status.ts**

```typescript
// src/domain/status.ts
export type RequestStatus =
  | "new"
  | "clarifying"
  | "answered"
  | "accepted"
  | "rejected";

const TERMINAL: ReadonlySet<RequestStatus> = new Set(["accepted", "rejected"]);

const ALLOWED: Record<RequestStatus, ReadonlySet<RequestStatus>> = {
  new: new Set(["clarifying", "accepted", "rejected"]),
  clarifying: new Set(["answered", "accepted", "rejected"]),
  answered: new Set(["clarifying", "accepted", "rejected"]),
  accepted: new Set(),
  rejected: new Set(),
};

const LABELS_TR: Record<RequestStatus, string> = {
  new: "Yeni",
  clarifying: "Netleştiriliyor",
  answered: "Cevaplandı",
  accepted: "Kabul edildi",
  rejected: "Reddedildi",
};

export function isTerminal(s: RequestStatus): boolean {
  return TERMINAL.has(s);
}

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return ALLOWED[from].has(to);
}

export function statusLabelTr(s: RequestStatus): string {
  return LABELS_TR[s];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/domain/status.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/status.ts src/domain/status.test.ts
git commit -m "feat: request status state machine"
```

---

## Task 4: Domain — request_no biçimleme

**Files:**
- Create: `src/domain/request-no.ts`
- Test: `src/domain/request-no.test.ts`

- [ ] **Step 1: Failing test yaz**

```typescript
// src/domain/request-no.test.ts
import { expect, test, describe } from "bun:test";
import { formatRequestNo } from "./request-no";

describe("formatRequestNo", () => {
  test("pads to 4 digits with TALEP- prefix", () => {
    expect(formatRequestNo(1)).toBe("TALEP-0001");
    expect(formatRequestNo(16)).toBe("TALEP-0016");
    expect(formatRequestNo(123)).toBe("TALEP-0123");
  });
  test("does not truncate beyond 4 digits", () => {
    expect(formatRequestNo(12345)).toBe("TALEP-12345");
  });
  test("throws on non-positive", () => {
    expect(() => formatRequestNo(0)).toThrow();
    expect(() => formatRequestNo(-1)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/domain/request-no.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement request-no.ts**

```typescript
// src/domain/request-no.ts
export function formatRequestNo(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`invalid request sequence: ${seq}`);
  }
  return `TALEP-${String(seq).padStart(4, "0")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/domain/request-no.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/request-no.ts src/domain/request-no.test.ts
git commit -m "feat: request number formatting"
```

---

## Task 5: Domain — validation şemaları

**Files:**
- Create: `src/domain/validation.ts`
- Test: `src/domain/validation.test.ts`

- [ ] **Step 1: Failing test yaz**

```typescript
// src/domain/validation.test.ts
import { expect, test, describe } from "bun:test";
import { newRequestSchema, replySchema, decisionSchema } from "./validation";

describe("newRequestSchema", () => {
  const valid = {
    department: "Satın alma",
    application: "ERP",
    module_area: "",
    request_type: "feature",
    title: "Kalıp modülü",
    description: "Kalıp malzemeleri için ayrı modül",
    expected_benefit: "Takip kolaylaşır",
    priority: "high",
  };
  test("accepts valid input", () => {
    expect(newRequestSchema.safeParse(valid).success).toBe(true);
  });
  test("rejects empty title", () => {
    expect(newRequestSchema.safeParse({ ...valid, title: "" }).success).toBe(
      false,
    );
  });
  test("rejects unknown request_type", () => {
    expect(
      newRequestSchema.safeParse({ ...valid, request_type: "xxx" }).success,
    ).toBe(false);
  });
  test("rejects unknown priority", () => {
    expect(
      newRequestSchema.safeParse({ ...valid, priority: "urgent" }).success,
    ).toBe(false);
  });
});

describe("replySchema", () => {
  test("rejects blank body", () => {
    expect(replySchema.safeParse({ body: "  " }).success).toBe(false);
  });
  test("accepts non-empty body", () => {
    expect(replySchema.safeParse({ body: "cevabım" }).success).toBe(true);
  });
});

describe("decisionSchema", () => {
  test("accept without reason is valid", () => {
    expect(decisionSchema.safeParse({ decision: "accept" }).success).toBe(true);
  });
  test("reject requires reason", () => {
    expect(decisionSchema.safeParse({ decision: "reject" }).success).toBe(
      false,
    );
    expect(
      decisionSchema.safeParse({ decision: "reject", reason: "uygun değil" })
        .success,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/domain/validation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement validation.ts**

```typescript
// src/domain/validation.ts
import { z } from "zod";

const nonBlank = (max: number) =>
  z.string().trim().min(1).max(max);

export const REQUEST_TYPES = ["feature", "bug", "task"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;

export const newRequestSchema = z.object({
  department: nonBlank(120),
  application: nonBlank(120),
  module_area: z.string().trim().max(120).optional().default(""),
  request_type: z.enum(REQUEST_TYPES),
  title: nonBlank(200),
  description: nonBlank(5000),
  expected_benefit: nonBlank(2000),
  priority: z.enum(PRIORITIES),
});
export type NewRequestInput = z.infer<typeof newRequestSchema>;

export const replySchema = z.object({
  body: nonBlank(5000),
});

export const messageSchema = z.object({
  body: nonBlank(5000),
});

export const decisionSchema = z
  .object({
    decision: z.enum(["accept", "reject"]),
    reason: z.string().trim().max(2000).optional(),
  })
  .refine((d) => d.decision !== "reject" || !!d.reason, {
    message: "reject requires reason",
    path: ["reason"],
  });
export type DecisionInput = z.infer<typeof decisionSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/domain/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/validation.ts src/domain/validation.test.ts
git commit -m "feat: zod validation schemas for forms"
```

---

## Task 6: Domain — yetki (authz)

**Files:**
- Create: `src/domain/authz.ts`
- Test: `src/domain/authz.test.ts`

- [ ] **Step 1: Failing test yaz**

```typescript
// src/domain/authz.test.ts
import { expect, test, describe } from "bun:test";
import { isAdmin, canViewRequest, canReply } from "./authz";

const admin = { email: "boss@kokilmetal.com.tr", name: "Boss", isAdmin: true };
const owner = { email: "a@kokilmetal.com.tr", name: "A", isAdmin: false };
const other = { email: "b@kokilmetal.com.tr", name: "B", isAdmin: false };
const req = { requester_email: "a@kokilmetal.com.tr", status: "clarifying" as const };

describe("isAdmin", () => {
  test("matches allowlist case-insensitively", () => {
    expect(isAdmin("Boss@Kokilmetal.com.tr", ["boss@kokilmetal.com.tr"])).toBe(
      true,
    );
    expect(isAdmin("x@kokilmetal.com.tr", ["boss@kokilmetal.com.tr"])).toBe(
      false,
    );
  });
});

describe("canViewRequest", () => {
  test("admin sees any", () => {
    expect(canViewRequest(admin, req)).toBe(true);
  });
  test("owner sees own", () => {
    expect(canViewRequest(owner, req)).toBe(true);
  });
  test("other requester cannot see", () => {
    expect(canViewRequest(other, req)).toBe(false);
  });
});

describe("canReply", () => {
  test("owner can reply when clarifying", () => {
    expect(canReply(owner, { ...req, status: "clarifying" })).toBe(true);
  });
  test("owner cannot reply when not clarifying", () => {
    expect(canReply(owner, { ...req, status: "new" })).toBe(false);
    expect(canReply(owner, { ...req, status: "accepted" })).toBe(false);
  });
  test("admin does not reply via requester path", () => {
    expect(canReply(admin, { ...req, status: "clarifying" })).toBe(false);
  });
  test("other cannot reply", () => {
    expect(canReply(other, { ...req, status: "clarifying" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/domain/authz.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement authz.ts**

```typescript
// src/domain/authz.ts
import type { RequestStatus } from "./status";

export type User = { email: string; name: string; isAdmin: boolean };
export type RequestRef = {
  requester_email: string;
  status: RequestStatus;
};

export function isAdmin(email: string, adminEmails: string[]): boolean {
  return adminEmails.includes(email.trim().toLowerCase());
}

export function canViewRequest(user: User, req: RequestRef): boolean {
  if (user.isAdmin) return true;
  return user.email.toLowerCase() === req.requester_email.toLowerCase();
}

export function canReply(user: User, req: RequestRef): boolean {
  if (user.isAdmin) return false;
  if (user.email.toLowerCase() !== req.requester_email.toLowerCase())
    return false;
  return req.status === "clarifying";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/domain/authz.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/authz.ts src/domain/authz.test.ts
git commit -m "feat: authorization decision helpers"
```

---

## Task 7: DB katmanı — şema + repo

**Files:**
- Create: `src/db/db.ts`, `src/db/repo.ts`
- Test: `src/db/repo.test.ts`

- [ ] **Step 1: db.ts (bağlantı + migration) yaz**

```typescript
// src/db/db.ts
import { Database } from "bun:sqlite";

export function openDb(path: string): Database {
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_no TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      requester_name TEXT NOT NULL,
      requester_email TEXT NOT NULL,
      department TEXT NOT NULL,
      application TEXT NOT NULL,
      module_area TEXT NOT NULL DEFAULT '',
      request_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      expected_benefit TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new'
    );
    CREATE INDEX IF NOT EXISTS idx_requests_email ON requests(requester_email);
    CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id),
      author_role TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_request ON messages(request_id);
  `);
}
```

- [ ] **Step 2: repo.test.ts (failing) yaz**

```typescript
// src/db/repo.test.ts
import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { openDb } from "./db";
import { makeRepo, type Repo } from "./repo";

let repo: Repo;

beforeEach(() => {
  // in-memory db, fresh per test
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  // reuse migration by opening via a temp path is awkward in memory;
  // call the same exec through openDb is not possible on :memory: path,
  // so create schema by importing migrate indirectly:
  repo = makeRepo(seedSchema(db));
});

function seedSchema(db: Database): Database {
  db.exec(`
    CREATE TABLE requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_no TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
      requester_name TEXT NOT NULL, requester_email TEXT NOT NULL,
      department TEXT NOT NULL, application TEXT NOT NULL,
      module_area TEXT NOT NULL DEFAULT '', request_type TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL,
      expected_benefit TEXT NOT NULL, priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new');
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id),
      author_role TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
  `);
  return db;
}

const baseInput = {
  requester_name: "A",
  requester_email: "a@kokilmetal.com.tr",
  department: "Satın alma",
  application: "ERP",
  module_area: "",
  request_type: "feature",
  title: "Kalıp modülü",
  description: "detay",
  expected_benefit: "fayda",
  priority: "high",
};

describe("repo.createRequest", () => {
  test("assigns sequential request_no and status new", () => {
    const r1 = repo.createRequest(baseInput, "2026-06-12T00:00:00Z");
    const r2 = repo.createRequest(baseInput, "2026-06-12T00:01:00Z");
    expect(r1.request_no).toBe("TALEP-0001");
    expect(r2.request_no).toBe("TALEP-0002");
    expect(r1.status).toBe("new");
  });
});

describe("repo messages + status", () => {
  test("addMessage and listMessages roundtrip", () => {
    const r = repo.createRequest(baseInput, "2026-06-12T00:00:00Z");
    repo.addMessage(r.id, "admin", "soru?", "2026-06-12T01:00:00Z");
    repo.addMessage(r.id, "requester", "cevap", "2026-06-12T02:00:00Z");
    const msgs = repo.listMessages(r.id);
    expect(msgs.map((m) => m.author_role)).toEqual(["admin", "requester"]);
  });
  test("updateStatus persists", () => {
    const r = repo.createRequest(baseInput, "2026-06-12T00:00:00Z");
    repo.updateStatus(r.id, "clarifying");
    expect(repo.getRequest(r.id)?.status).toBe("clarifying");
  });
});

describe("repo listing", () => {
  test("listByEmail returns only that requester", () => {
    repo.createRequest(baseInput, "t");
    repo.createRequest({ ...baseInput, requester_email: "b@kokilmetal.com.tr" }, "t");
    expect(repo.listByEmail("a@kokilmetal.com.tr").length).toBe(1);
  });
  test("listAll filters by status", () => {
    const r = repo.createRequest(baseInput, "t");
    repo.createRequest(baseInput, "t");
    repo.updateStatus(r.id, "accepted");
    expect(repo.listAll({ status: "accepted" }).length).toBe(1);
    expect(repo.listAll({}).length).toBe(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test src/db/repo.test.ts`
Expected: FAIL — `./repo` not found.

- [ ] **Step 4: Implement repo.ts**

```typescript
// src/db/repo.ts
import type { Database } from "bun:sqlite";
import { formatRequestNo } from "../domain/request-no";
import type { RequestStatus } from "../domain/status";
import type { NewRequestInput } from "../domain/validation";

export type RequestRow = {
  id: number;
  request_no: string;
  created_at: string;
  requester_name: string;
  requester_email: string;
  department: string;
  application: string;
  module_area: string;
  request_type: string;
  title: string;
  description: string;
  expected_benefit: string;
  priority: string;
  status: RequestStatus;
};

export type MessageRow = {
  id: number;
  request_id: number;
  author_role: "admin" | "requester";
  body: string;
  created_at: string;
};

export type CreateRequestInput = NewRequestInput & {
  requester_name: string;
  requester_email: string;
};

export type Repo = ReturnType<typeof makeRepo>;

export function makeRepo(db: Database) {
  return {
    createRequest(input: CreateRequestInput, createdAt: string): RequestRow {
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
            $no: requestNo,
            $at: createdAt,
            $name: input.requester_name,
            $email: input.requester_email,
            $dept: input.department,
            $app: input.application,
            $mod: input.module_area ?? "",
            $type: input.request_type,
            $title: input.title,
            $desc: input.description,
            $benefit: input.expected_benefit,
            $prio: input.priority,
          });
        return inserted!;
      });
      return tx();
    },

    getRequest(id: number): RequestRow | null {
      return (
        db
          .query<RequestRow, [number]>("SELECT * FROM requests WHERE id = ?")
          .get(id) ?? null
      );
    },

    listByEmail(email: string): RequestRow[] {
      return db
        .query<RequestRow, [string]>(
          "SELECT * FROM requests WHERE requester_email = ? ORDER BY id DESC",
        )
        .all(email);
    },

    listAll(filter: { status?: string; priority?: string }): RequestRow[] {
      const clauses: string[] = [];
      const params: Record<string, string> = {};
      if (filter.status) {
        clauses.push("status = $status");
        params.$status = filter.status;
      }
      if (filter.priority) {
        clauses.push("priority = $priority");
        params.$priority = filter.priority;
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      return db
        .query<RequestRow, any>(
          `SELECT * FROM requests ${where} ORDER BY id DESC`,
        )
        .all(params);
    },

    addMessage(
      requestId: number,
      role: "admin" | "requester",
      body: string,
      createdAt: string,
    ): void {
      db.query(
        `INSERT INTO messages (request_id, author_role, body, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(requestId, role, body, createdAt);
    },

    listMessages(requestId: number): MessageRow[] {
      return db
        .query<MessageRow, [number]>(
          "SELECT * FROM messages WHERE request_id = ? ORDER BY id ASC",
        )
        .all(requestId);
    },

    updateStatus(id: number, status: RequestStatus): void {
      db.query("UPDATE requests SET status = ? WHERE id = ?").run(status, id);
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/db/repo.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/db.ts src/db/repo.ts src/db/repo.test.ts
git commit -m "feat: sqlite schema and repository layer"
```

---

## Task 8: Oturum — imzalı cookie

**Files:**
- Create: `src/auth/session.ts`
- Test: `src/auth/session.test.ts`

- [ ] **Step 1: Failing test yaz**

```typescript
// src/auth/session.test.ts
import { expect, test, describe } from "bun:test";
import { signSession, verifySession } from "./session";

const secret = "test-secret-at-least-16-chars";
const user = { email: "a@kokilmetal.com.tr", name: "A" };

describe("session sign/verify", () => {
  test("round-trips a valid token", () => {
    const token = signSession(user, secret);
    expect(verifySession(token, secret)).toEqual(user);
  });
  test("rejects tampered payload", () => {
    const token = signSession(user, secret);
    const tampered = token.slice(0, -2) + "xx";
    expect(verifySession(tampered, secret)).toBeNull();
  });
  test("rejects wrong secret", () => {
    const token = signSession(user, secret);
    expect(verifySession(token, "other-secret-16chars")).toBeNull();
  });
  test("rejects garbage", () => {
    expect(verifySession("not-a-token", secret)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/auth/session.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement session.ts**

```typescript
// src/auth/session.ts
import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionUser = { email: string; name: string };

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signSession(user: SessionUser, secret: string): string {
  const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

export function verifySession(
  token: string,
  secret: string,
): SessionUser | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts as [string, string];
  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof user?.email === "string" && typeof user?.name === "string") {
      return { email: user.email, name: user.name };
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/auth/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/session.ts src/auth/session.test.ts
git commit -m "feat: hmac-signed cookie session"
```

---

## Task 9: Google OAuth yardımcıları

**Files:**
- Create: `src/auth/google.ts`
- Test: `src/auth/google.test.ts`

- [ ] **Step 1: Failing test yaz**

```typescript
// src/auth/google.test.ts
import { expect, test, describe } from "bun:test";
import { buildAuthUrl, verifyDomain } from "./google";

describe("buildAuthUrl", () => {
  test("contains client_id, redirect, scope, hd, state", () => {
    const url = buildAuthUrl({
      clientId: "cid",
      redirectUri: "http://localhost:3000/auth/google/callback",
      hostedDomain: "kokilmetal.com.tr",
      state: "abc",
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("hd")).toBe("kokilmetal.com.tr");
    expect(u.searchParams.get("state")).toBe("abc");
    expect(u.searchParams.get("scope")).toContain("email");
  });
});

describe("verifyDomain", () => {
  test("accepts matching hosted domain", () => {
    expect(
      verifyDomain(
        { email: "a@kokilmetal.com.tr", hd: "kokilmetal.com.tr" },
        "kokilmetal.com.tr",
      ),
    ).toBe(true);
  });
  test("rejects mismatched email domain even if hd claims match", () => {
    expect(
      verifyDomain(
        { email: "a@gmail.com", hd: "kokilmetal.com.tr" },
        "kokilmetal.com.tr",
      ),
    ).toBe(false);
  });
  test("rejects when hd missing", () => {
    expect(
      verifyDomain({ email: "a@kokilmetal.com.tr" }, "kokilmetal.com.tr"),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/auth/google.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement google.ts**

```typescript
// src/auth/google.ts
export type GoogleProfile = {
  email: string;
  name?: string;
  hd?: string;
};

export function buildAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  hostedDomain: string;
  state: string;
}): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("hd", opts.hostedDomain);
  u.searchParams.set("state", opts.state);
  u.searchParams.set("prompt", "select_account");
  return u.toString();
}

export function verifyDomain(
  profile: { email: string; hd?: string },
  hostedDomain: string,
): boolean {
  if (!profile.hd || profile.hd !== hostedDomain) return false;
  const domain = profile.email.split("@")[1]?.toLowerCase();
  return domain === hostedDomain.toLowerCase();
}

// I/O — exchanges the code for a profile. Not unit tested (network);
// covered indirectly and kept thin.
export async function exchangeCode(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleProfile> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const tokens = (await res.json()) as { id_token: string };
  const payload = decodeJwtPayload(tokens.id_token);
  return {
    email: String(payload.email ?? ""),
    name: payload.name ? String(payload.name) : undefined,
    hd: payload.hd ? String(payload.hd) : undefined,
  };
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part) throw new Error("malformed id_token");
  return JSON.parse(Buffer.from(part, "base64url").toString());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/auth/google.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/google.ts src/auth/google.test.ts
git commit -m "feat: google oauth url builder and domain verification"
```

---

## Task 10: Mail gönderici (best-effort)

**Files:**
- Create: `src/mail/mailer.ts`
- Test: `src/mail/mailer.test.ts`

- [ ] **Step 1: Failing test yaz**

```typescript
// src/mail/mailer.test.ts
import { expect, test, describe } from "bun:test";
import { makeMailer, type Transport } from "./mailer";

function fakeTransport(): Transport & { sent: any[]; fail?: boolean } {
  const t: any = {
    sent: [],
    async sendMail(msg: any) {
      if (t.fail) throw new Error("smtp down");
      t.sent.push(msg);
      return { messageId: "x" };
    },
  };
  return t;
}

describe("mailer (best-effort)", () => {
  test("sends with configured from", async () => {
    const tr = fakeTransport();
    const mail = makeMailer(tr, "From <f@k.com>");
    await mail.send("to@k.com", "Konu", "<p>gövde</p>");
    expect(tr.sent.length).toBe(1);
    expect(tr.sent[0].from).toBe("From <f@k.com>");
    expect(tr.sent[0].to).toBe("to@k.com");
  });
  test("swallows transport errors (does not throw)", async () => {
    const tr = fakeTransport();
    tr.fail = true;
    const mail = makeMailer(tr, "From <f@k.com>");
    await expect(mail.send("to@k.com", "s", "b")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/mail/mailer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement mailer.ts**

```typescript
// src/mail/mailer.ts
import nodemailer from "nodemailer";
import type { Config } from "../config";

export type Transport = {
  sendMail(msg: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<unknown>;
};

export function makeMailer(transport: Transport, from: string) {
  return {
    async send(to: string, subject: string, html: string): Promise<void> {
      try {
        await transport.sendMail({ from, to, subject, html });
      } catch (err) {
        console.error(`[mail] gönderilemedi to=${to} subject=${subject}`, err);
      }
    },
  };
}

export function transportFromConfig(cfg: Config): Transport {
  return nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure,
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
  });
}

export type Mailer = ReturnType<typeof makeMailer>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/mail/mailer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mail/mailer.ts src/mail/mailer.test.ts
git commit -m "feat: best-effort mailer over nodemailer transport"
```

---

## Task 11: Görünümler (HTML render)

**Files:**
- Create: `src/views/views.ts`

> Saf string render; karmaşık değil, birim test yerine route entegrasyon testlerinde içerik kontrol edilir (Task 12-13).

- [ ] **Step 1: views.ts yaz**

```typescript
// src/views/views.ts
import type { RequestRow, MessageRow } from "../db/repo";
import { statusLabelTr, type RequestStatus } from "../domain/status";
import { REQUEST_TYPES, PRIORITIES } from "../domain/validation";

const TYPE_TR: Record<string, string> = {
  feature: "Yeni Özellik",
  bug: "Hata",
  task: "Görev",
};
const PRIO_TR: Record<string, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function layout(title: string, body: string, user?: { name: string }): string {
  return `<!doctype html><html lang="tr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Talep Portalı</title>
<script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-slate-50 text-slate-800">
<header class="bg-white border-b">
  <div class="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
    <a href="/" class="font-semibold">Talep Portalı</a>
    <nav class="text-sm flex gap-4 items-center">
      <a href="/my" class="hover:underline">Taleplerim</a>
      ${user ? `<span class="text-slate-500">${esc(user.name)}</span>
      <form method="post" action="/logout"><button class="hover:underline">Çıkış</button></form>` : ""}
    </nav>
  </div>
</header>
<main class="max-w-4xl mx-auto px-4 py-6">${body}</main>
</body></html>`;
}

export function loginPage(): string {
  return layout(
    "Giriş",
    `<div class="bg-white rounded-lg border p-8 text-center">
      <h1 class="text-xl font-semibold mb-2">Talep Portalı</h1>
      <p class="text-slate-500 mb-6">Devam etmek için kurumsal hesabınızla giriş yapın.</p>
      <a href="/auth/google" class="inline-block bg-slate-800 text-white px-5 py-2 rounded">Google ile giriş</a>
    </div>`,
  );
}

export function newRequestForm(
  user: { name: string },
  errors?: string[],
): string {
  const opt = (
    list: readonly string[],
    tr: Record<string, string>,
  ): string =>
    list.map((v) => `<option value="${v}">${esc(tr[v] ?? v)}</option>`).join("");
  const err = errors?.length
    ? `<div class="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4">
        <ul class="list-disc pl-5">${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`
    : "";
  const field = (label: string, html: string) =>
    `<label class="block mb-4"><span class="block text-sm font-medium mb-1">${esc(label)}</span>${html}</label>`;
  const input = `class="w-full border rounded px-3 py-2"`;
  return layout(
    "Yeni Talep",
    `<h1 class="text-xl font-semibold mb-4">Yeni Talep</h1>${err}
    <form method="post" action="/requests" class="bg-white rounded-lg border p-6">
      ${field("Departman", `<input ${input} name="department" required>`)}
      ${field("Uygulama", `<input ${input} name="application" value="ERP" required>`)}
      ${field("Modül/Alan (opsiyonel)", `<input ${input} name="module_area">`)}
      ${field("Talep Tipi", `<select ${input} name="request_type">${opt(REQUEST_TYPES, TYPE_TR)}</select>`)}
      ${field("Öncelik", `<select ${input} name="priority">${opt(PRIORITIES, PRIO_TR)}</select>`)}
      ${field("Başlık", `<input ${input} name="title" required>`)}
      ${field("Açıklama", `<textarea ${input} name="description" rows="4" required></textarea>`)}
      ${field("Beklenen Fayda", `<textarea ${input} name="expected_benefit" rows="2" required></textarea>`)}
      <button class="bg-slate-800 text-white px-5 py-2 rounded">Gönder</button>
    </form>`,
    user,
  );
}

export function requestRow(r: RequestRow): string {
  return `<a href="/requests/${r.id}" class="block bg-white border rounded p-4 mb-2 hover:bg-slate-50">
    <div class="flex justify-between">
      <span class="font-medium">${esc(r.request_no)} · ${esc(r.title)}</span>
      <span class="text-sm text-slate-500">${esc(statusLabelTr(r.status))}</span>
    </div>
    <div class="text-sm text-slate-500">${esc(PRIO_TR[r.priority] ?? r.priority)} · ${esc(r.application)}</div>
  </a>`;
}

export function myList(user: { name: string }, rows: RequestRow[]): string {
  const body = rows.length
    ? rows.map(requestRow).join("")
    : `<p class="text-slate-500">Henüz talebiniz yok. <a class="underline" href="/">Yeni talep</a> oluşturun.</p>`;
  return layout(
    "Taleplerim",
    `<div class="flex justify-between items-center mb-4">
      <h1 class="text-xl font-semibold">Taleplerim</h1>
      <a href="/" class="bg-slate-800 text-white px-4 py-2 rounded text-sm">Yeni talep</a>
    </div>${body}`,
    user,
  );
}

export function thread(messages: MessageRow[]): string {
  if (!messages.length)
    return `<p class="text-slate-500 text-sm">Henüz mesaj yok.</p>`;
  return messages
    .map((m) => {
      const isAdmin = m.author_role === "admin";
      return `<div class="mb-3 ${isAdmin ? "" : "pl-8"}">
        <div class="text-xs text-slate-400 mb-1">${isAdmin ? "Yönetici (soru)" : "Talep eden (cevap)"} · ${esc(m.created_at)}</div>
        <div class="bg-white border rounded p-3 whitespace-pre-wrap">${esc(m.body)}</div>
      </div>`;
    })
    .join("");
}

export function requestDetail(opts: {
  user: { name: string };
  r: RequestRow;
  messages: MessageRow[];
  canReply: boolean;
  isAdmin: boolean;
  csrf: string;
}): string {
  const { r, messages, canReply, isAdmin, csrf, user } = opts;
  const meta = `<div class="bg-white border rounded p-4 mb-4">
    <h1 class="text-xl font-semibold">${esc(r.request_no)} · ${esc(r.title)}</h1>
    <div class="text-sm text-slate-500 mb-2">${esc(statusLabelTr(r.status))} · ${esc(PRIO_TR[r.priority] ?? r.priority)} · ${esc(r.department)}</div>
    <p class="whitespace-pre-wrap mb-2">${esc(r.description)}</p>
    <p class="text-sm"><span class="font-medium">Beklenen fayda:</span> ${esc(r.expected_benefit)}</p>
  </div>`;
  const input = `class="w-full border rounded px-3 py-2"`;
  const replyBox = canReply
    ? `<form method="post" action="/requests/${r.id}/reply" class="bg-white border rounded p-4 mt-4">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <textarea ${input} name="body" rows="3" placeholder="Cevabınız..." required></textarea>
        <button class="bg-slate-800 text-white px-4 py-2 rounded mt-2">Cevapla</button>
      </form>`
    : "";
  const adminBox = isAdmin
    ? `<form method="post" action="/admin/requests/${r.id}/message" class="bg-white border rounded p-4 mt-4">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <textarea ${input} name="body" rows="3" placeholder="Netleştirme sorusu..." required></textarea>
        <button class="bg-slate-800 text-white px-4 py-2 rounded mt-2">Soru ekle</button>
      </form>
      <form method="post" action="/admin/requests/${r.id}/decision" class="bg-white border rounded p-4 mt-4">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <textarea ${input} name="reason" rows="2" placeholder="Karar notu / ret gerekçesi"></textarea>
        <div class="flex gap-2 mt-2">
          <button name="decision" value="accept" class="bg-green-700 text-white px-4 py-2 rounded">Kabul et</button>
          <button name="decision" value="reject" class="bg-red-700 text-white px-4 py-2 rounded">Reddet</button>
        </div>
      </form>`
    : "";
  return layout(
    r.request_no,
    `${meta}<h2 class="font-semibold mb-2">Netleştirme</h2>${thread(messages)}${replyBox}${adminBox}`,
    user,
  );
}

export function adminList(
  user: { name: string },
  rows: RequestRow[],
  filter: { status?: string },
): string {
  const statuses: RequestStatus[] = [
    "new",
    "clarifying",
    "answered",
    "accepted",
    "rejected",
  ];
  const tabs = [`<a href="/admin" class="px-3 py-1 rounded ${!filter.status ? "bg-slate-800 text-white" : "bg-white border"}">Hepsi</a>`]
    .concat(
      statuses.map(
        (s) =>
          `<a href="/admin?status=${s}" class="px-3 py-1 rounded ${filter.status === s ? "bg-slate-800 text-white" : "bg-white border"}">${esc(statusLabelTr(s))}</a>`,
      ),
    )
    .join(" ");
  const body = rows.length
    ? rows.map(requestRow).join("")
    : `<p class="text-slate-500">Kayıt yok.</p>`;
  return layout(
    "Yönetim",
    `<h1 class="text-xl font-semibold mb-4">Tüm Talepler</h1>
     <div class="flex flex-wrap gap-2 mb-4 text-sm">${tabs}</div>${body}`,
    user,
  );
}

export function noticePage(
  user: { name: string },
  title: string,
  message: string,
): string {
  return layout(
    title,
    `<div class="bg-white border rounded p-6">
      <h1 class="text-xl font-semibold mb-2">${esc(title)}</h1>
      <p>${esc(message)}</p>
      <a href="/my" class="underline text-sm">Taleplerime git</a>
    </div>`,
    user,
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/views.ts
git commit -m "feat: server-rendered html views"
```

---

## Task 12: Public route'lar (giriş + talep + cevap)

**Files:**
- Create: `src/routes/public.ts`, `src/routes/auth.ts`, `src/app.ts`
- Test: `src/routes/public.test.ts`

**Bağlam (app.ts arayüzü — tüm route task'ları buna bağlanır):** `app.ts`, bağımlılıkları (config, repo, mailer, clock) dışarıdan alan bir fabrika ihraç eder; böylece testte mock geçilebilir.

- [ ] **Step 1: app.ts iskeletini yaz (auth middleware + DI)**

```typescript
// src/app.ts
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Config } from "./config";
import type { Repo } from "./db/repo";
import type { Mailer } from "./mail/mailer";
import { verifySession, signSession } from "./auth/session";
import { isAdmin } from "./domain/authz";
import type { User } from "./domain/authz";
import { registerAuthRoutes } from "./routes/auth";
import { registerPublicRoutes } from "./routes/public";
import { registerAdminRoutes } from "./routes/admin";

export type Deps = {
  config: Config;
  repo: Repo;
  mailer: Mailer;
  now: () => string; // ISO timestamp; injectable for tests
};

export type AppEnv = {
  Variables: { user: User; csrf: string };
};

export function buildApp(deps: Deps) {
  const app = new Hono<AppEnv>();

  // Auth + CSRF middleware for everything except /auth/*
  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/auth/")) return next();
    const token = getCookie(c, "session");
    const session = token ? verifySession(token, deps.config.sessionSecret) : null;
    if (!session) {
      if (c.req.method !== "GET") return c.text("Oturum yok", 401);
      // render login
      const { loginPage } = await import("./views/views");
      return c.html(loginPage(), 401);
    }
    const user: User = {
      email: session.email,
      name: session.name,
      isAdmin: isAdmin(session.email, deps.config.adminEmails),
    };
    c.set("user", user);

    // CSRF: ensure cookie exists; verify on mutating requests
    let csrf = getCookie(c, "csrf");
    if (!csrf) {
      csrf = crypto.randomUUID();
      setCookie(c, "csrf", csrf, { httpOnly: false, sameSite: "Lax", path: "/" });
    }
    c.set("csrf", csrf);
    if (c.req.method === "POST") {
      const form = await c.req.parseBody();
      const sent = form["_csrf"];
      if (sent !== csrf) return c.text("CSRF doğrulaması başarısız", 403);
      // stash parsed body for handlers
      (c.req as any)._parsedBody = form;
    }
    return next();
  });

  registerAuthRoutes(app, deps, signSession);
  registerPublicRoutes(app, deps);
  registerAdminRoutes(app, deps);
  return app;
}

// Handlers read the already-parsed body to avoid double-parse.
export async function body(c: any): Promise<Record<string, any>> {
  return (c.req as any)._parsedBody ?? (await c.req.parseBody());
}
```

- [ ] **Step 2: public.test.ts (failing) yaz**

```typescript
// src/routes/public.test.ts
import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { makeRepo, type Repo } from "../db/repo";
import { makeMailer } from "../mail/mailer";
import { signSession } from "../auth/session";
import { buildApp } from "../app";
import { loadConfig } from "../config";

const cfg = loadConfig({
  APP_BASE_URL: "http://localhost:3000",
  SESSION_SECRET: "test-secret-16chars-min",
  GOOGLE_CLIENT_ID: "cid",
  GOOGLE_CLIENT_SECRET: "sec",
  GOOGLE_HOSTED_DOMAIN: "kokilmetal.com.tr",
  ADMIN_EMAILS: "boss@kokilmetal.com.tr",
  SMTP_HOST: "smtp.zoho.com",
  SMTP_PORT: "465",
  SMTP_SECURE: "true",
  MAIL_FROM: "From <f@k.com>",
});

let repo: Repo;
let sent: any[];
let app: ReturnType<typeof buildApp>;

function schema(db: Database): Database {
  db.exec(`
    CREATE TABLE requests (id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_no TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
      requester_name TEXT NOT NULL, requester_email TEXT NOT NULL,
      department TEXT NOT NULL, application TEXT NOT NULL,
      module_area TEXT NOT NULL DEFAULT '', request_type TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL,
      expected_benefit TEXT NOT NULL, priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new');
    CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id),
      author_role TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);`);
  return db;
}

function cookie(email: string, name: string): string {
  const s = signSession({ email, name }, cfg.sessionSecret);
  return `session=${s}; csrf=test-csrf`;
}

beforeEach(() => {
  repo = makeRepo(schema(new Database(":memory:")));
  sent = [];
  const mailer = makeMailer(
    { async sendMail(m: any) { sent.push(m); return {}; } },
    cfg.mailFrom,
  );
  app = buildApp({ config: cfg, repo, mailer, now: () => "2026-06-12T00:00:00Z" });
});

describe("GET / (auth gate)", () => {
  test("unauthenticated GET returns login page", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Google ile giriş");
  });
  test("authenticated GET shows form", async () => {
    const res = await app.request("/", {
      headers: { Cookie: cookie("a@kokilmetal.com.tr", "A") },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Yeni Talep");
  });
});

describe("POST /requests", () => {
  test("creates request, notifies admin, redirects", async () => {
    const form = new URLSearchParams({
      _csrf: "test-csrf",
      department: "Satın alma",
      application: "ERP",
      module_area: "",
      request_type: "feature",
      priority: "high",
      title: "Kalıp modülü",
      description: "detay",
      expected_benefit: "fayda",
    });
    const res = await app.request("/requests", {
      method: "POST",
      headers: {
        Cookie: cookie("a@kokilmetal.com.tr", "A"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    expect(res.status).toBe(302);
    const all = repo.listAll({});
    expect(all.length).toBe(1);
    expect(all[0]!.request_no).toBe("TALEP-0001");
    // admin notified + requester ack => at least 1 admin mail
    expect(sent.some((m) => m.to === "boss@kokilmetal.com.tr")).toBe(true);
  });

  test("invalid input re-renders form with errors", async () => {
    const form = new URLSearchParams({
      _csrf: "test-csrf",
      department: "",
      application: "ERP",
      request_type: "feature",
      priority: "high",
      title: "",
      description: "d",
      expected_benefit: "f",
    });
    const res = await app.request("/requests", {
      method: "POST",
      headers: {
        Cookie: cookie("a@kokilmetal.com.tr", "A"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    expect(res.status).toBe(400);
    expect(repo.listAll({}).length).toBe(0);
  });
});

describe("reply flow", () => {
  test("owner can reply only when clarifying", async () => {
    const r = repo.createRequest(
      {
        requester_name: "A", requester_email: "a@kokilmetal.com.tr",
        department: "d", application: "ERP", module_area: "",
        request_type: "feature", title: "t", description: "d",
        expected_benefit: "f", priority: "high",
      },
      "t",
    );
    // before any admin question, status is new -> reply forbidden
    let res = await app.request(`/requests/${r.id}/reply`, {
      method: "POST",
      headers: {
        Cookie: cookie("a@kokilmetal.com.tr", "A"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ _csrf: "test-csrf", body: "cevap" }).toString(),
    });
    expect(res.status).toBe(403);

    // move to clarifying, then reply works and status -> answered
    repo.updateStatus(r.id, "clarifying");
    res = await app.request(`/requests/${r.id}/reply`, {
      method: "POST",
      headers: {
        Cookie: cookie("a@kokilmetal.com.tr", "A"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ _csrf: "test-csrf", body: "cevap" }).toString(),
    });
    expect(res.status).toBe(302);
    expect(repo.getRequest(r.id)?.status).toBe("answered");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test src/routes/public.test.ts`
Expected: FAIL — `../routes/public` / `../routes/admin` / `../routes/auth` not found.

- [ ] **Step 4: auth.ts (minimal, callback I/O thin) yaz**

```typescript
// src/routes/auth.ts
import type { Hono } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import type { AppEnv, Deps } from "../app";
import type { SessionUser } from "../auth/session";
import { buildAuthUrl, exchangeCode, verifyDomain } from "../auth/google";

export function registerAuthRoutes(
  app: Hono<AppEnv>,
  deps: Deps,
  sign: (u: SessionUser, secret: string) => string,
) {
  app.get("/auth/google", (c) => {
    const state = crypto.randomUUID();
    setCookie(c, "oauth_state", state, { httpOnly: true, sameSite: "Lax", path: "/" });
    const url = buildAuthUrl({
      clientId: deps.config.googleClientId,
      redirectUri: `${deps.config.appBaseUrl}/auth/google/callback`,
      hostedDomain: deps.config.googleHostedDomain,
      state,
    });
    return c.redirect(url);
  });

  app.get("/auth/google/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state || state !== getCookie(c, "oauth_state")) {
      return c.text("Geçersiz oturum açma isteği", 400);
    }
    const profile = await exchangeCode({
      code,
      clientId: deps.config.googleClientId,
      clientSecret: deps.config.googleClientSecret,
      redirectUri: `${deps.config.appBaseUrl}/auth/google/callback`,
    });
    if (!verifyDomain(profile, deps.config.googleHostedDomain)) {
      return c.text("Bu portal yalnızca kurumsal hesaplara açıktır.", 403);
    }
    const token = sign(
      { email: profile.email.toLowerCase(), name: profile.name ?? profile.email },
      deps.config.sessionSecret,
    );
    setCookie(c, "session", token, { httpOnly: true, sameSite: "Lax", path: "/" });
    return c.redirect("/my");
  });

  app.post("/logout", (c) => {
    deleteCookie(c, "session", { path: "/" });
    return c.redirect("/auth/google");
  });
}
```

- [ ] **Step 5: public.ts yaz**

```typescript
// src/routes/public.ts
import type { Hono } from "hono";
import type { AppEnv, Deps } from "../app";
import { body } from "../app";
import { newRequestSchema, replySchema } from "../domain/validation";
import { canViewRequest, canReply } from "../domain/authz";
import { canTransition } from "../domain/status";
import {
  newRequestForm,
  myList,
  requestDetail,
  noticePage,
} from "../views/views";

export function registerPublicRoutes(app: Hono<AppEnv>, deps: Deps) {
  app.get("/", (c) => c.html(newRequestForm(c.get("user"))));

  app.post("/requests", async (c) => {
    const user = c.get("user");
    const form = await body(c);
    const parsed = newRequestSchema.safeParse(form);
    if (!parsed.success) {
      const errs = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return c.html(newRequestForm(user, errs), 400);
    }
    const r = deps.repo.createRequest(
      { ...parsed.data, requester_name: user.name, requester_email: user.email },
      deps.now(),
    );
    for (const admin of deps.config.adminEmails) {
      await deps.mailer.send(
        admin,
        `Yeni talep: ${r.request_no}`,
        `<p>${r.request_no} — ${r.title}</p><p><a href="${deps.config.appBaseUrl}/admin/requests/${r.id}">İncele</a></p>`,
      );
    }
    await deps.mailer.send(
      user.email,
      `Talebiniz alındı: ${r.request_no}`,
      `<p>Talebiniz alındı. Takip: <a href="${deps.config.appBaseUrl}/requests/${r.id}">${r.request_no}</a></p>`,
    );
    return c.redirect(`/requests/${r.id}`);
  });

  app.get("/my", (c) => {
    const user = c.get("user");
    return c.html(myList(user, deps.repo.listByEmail(user.email)));
  });

  app.get("/requests/:id", (c) => {
    const user = c.get("user");
    const r = deps.repo.getRequest(Number(c.req.param("id")));
    if (!r || !canViewRequest(user, r)) return c.text("Bulunamadı", 404);
    return c.html(
      requestDetail({
        user,
        r,
        messages: deps.repo.listMessages(r.id),
        canReply: canReply(user, r),
        isAdmin: user.isAdmin,
        csrf: c.get("csrf"),
      }),
    );
  });

  app.post("/requests/:id/reply", async (c) => {
    const user = c.get("user");
    const r = deps.repo.getRequest(Number(c.req.param("id")));
    if (!r || !canViewRequest(user, r)) return c.text("Bulunamadı", 404);
    if (!canReply(user, r)) return c.text("Şu an cevap veremezsiniz", 403);
    const parsed = replySchema.safeParse(await body(c));
    if (!parsed.success) return c.text("Geçersiz cevap", 400);
    deps.repo.addMessage(r.id, "requester", parsed.data.body, deps.now());
    if (canTransition(r.status, "answered")) deps.repo.updateStatus(r.id, "answered");
    for (const admin of deps.config.adminEmails) {
      await deps.mailer.send(
        admin,
        `Cevaplandı: ${r.request_no}`,
        `<p><a href="${deps.config.appBaseUrl}/admin/requests/${r.id}">${r.request_no} cevaplandı</a></p>`,
      );
    }
    return c.redirect(`/requests/${r.id}`);
  });
}

// keep import used (noticePage available for future use)
void noticePage;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test src/routes/public.test.ts`
Expected: PASS (auth gate, create, invalid, reply flow). Admin routes referansı için Task 13'teki `admin.ts` gerekli — bu task'ta `admin.ts` henüz yoksa Step 4-5 import'u kırılır; **bu yüzden Task 13'teki Step 1 (admin.ts) bu adımdan ÖNCE tamamlanmalı** veya iki task tek commit'te bitirilmeli.

> **Sıra notu:** `app.ts` üç route modülünü de import ettiğinden, public testleri geçmeden önce `admin.ts` dosyasının en azından iskeleti var olmalı. Pratikte Task 12 ve 13 birlikte yürütülür; ayrı commit'ler atılır ama testler ikisi de yazıldıktan sonra yeşillenir.

- [ ] **Step 7: Commit**

```bash
git add src/app.ts src/routes/auth.ts src/routes/public.ts src/routes/public.test.ts
git commit -m "feat: app factory, auth routes, public request + reply routes"
```

---

## Task 13: Admin route'ları (soru + karar)

**Files:**
- Create: `src/routes/admin.ts`
- Test: `src/routes/admin.test.ts`

- [ ] **Step 1: admin.ts yaz** (Task 12 import zincirini tamamlar)

```typescript
// src/routes/admin.ts
import type { Hono } from "hono";
import type { AppEnv, Deps } from "../app";
import { body } from "../app";
import { messageSchema, decisionSchema } from "../domain/validation";
import { canTransition } from "../domain/status";
import { adminList, requestDetail } from "../views/views";

function requireAdmin(c: any): boolean {
  return c.get("user")?.isAdmin === true;
}

export function registerAdminRoutes(app: Hono<AppEnv>, deps: Deps) {
  app.get("/admin", (c) => {
    if (!requireAdmin(c)) return c.text("Yetkisiz", 403);
    const status = c.req.query("status");
    return c.html(
      adminList(c.get("user"), deps.repo.listAll({ status }), { status }),
    );
  });

  app.post("/admin/requests/:id/message", async (c) => {
    if (!requireAdmin(c)) return c.text("Yetkisiz", 403);
    const r = deps.repo.getRequest(Number(c.req.param("id")));
    if (!r) return c.text("Bulunamadı", 404);
    const parsed = messageSchema.safeParse(await body(c));
    if (!parsed.success) return c.text("Geçersiz soru", 400);
    if (!canTransition(r.status, "clarifying"))
      return c.text("Bu talep kapalı", 409);
    deps.repo.addMessage(r.id, "admin", parsed.data.body, deps.now());
    deps.repo.updateStatus(r.id, "clarifying");
    await deps.mailer.send(
      r.requester_email,
      `Talebiniz hakkında soru: ${r.request_no}`,
      `<p>Talebinizle ilgili sorular var. <a href="${deps.config.appBaseUrl}/requests/${r.id}">Cevaplayın</a></p>`,
    );
    return c.redirect(`/admin/requests/${r.id}`);
  });

  app.post("/admin/requests/:id/decision", async (c) => {
    if (!requireAdmin(c)) return c.text("Yetkisiz", 403);
    const r = deps.repo.getRequest(Number(c.req.param("id")));
    if (!r) return c.text("Bulunamadı", 404);
    const parsed = decisionSchema.safeParse(await body(c));
    if (!parsed.success) return c.text("Karar için gerekçe gerekli", 400);
    const target = parsed.data.decision === "accept" ? "accepted" : "rejected";
    if (!canTransition(r.status, target))
      return c.text("Bu talep zaten kapalı", 409);
    if (parsed.data.reason)
      deps.repo.addMessage(r.id, "admin", parsed.data.reason, deps.now());
    deps.repo.updateStatus(r.id, target);
    await deps.mailer.send(
      r.requester_email,
      `Talep ${target === "accepted" ? "kabul edildi" : "reddedildi"}: ${r.request_no}`,
      `<p>${r.request_no} ${target === "accepted" ? "kabul edildi" : "reddedildi"}.</p>${parsed.data.reason ? `<p>${parsed.data.reason}</p>` : ""}`,
    );
    return c.redirect(`/admin/requests/${r.id}`);
  });

  // admin detail uses same detail view as public
  app.get("/admin/requests/:id", (c) => {
    if (!requireAdmin(c)) return c.text("Yetkisiz", 403);
    const r = deps.repo.getRequest(Number(c.req.param("id")));
    if (!r) return c.text("Bulunamadı", 404);
    return c.html(
      requestDetail({
        user: c.get("user"),
        r,
        messages: deps.repo.listMessages(r.id),
        canReply: false,
        isAdmin: true,
        csrf: c.get("csrf"),
      }),
    );
  });
}
```

- [ ] **Step 2: admin.test.ts yaz**

```typescript
// src/routes/admin.test.ts
import { expect, test, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { makeRepo, type Repo } from "../db/repo";
import { makeMailer } from "../mail/mailer";
import { signSession } from "../auth/session";
import { buildApp } from "../app";
import { loadConfig } from "../config";

const cfg = loadConfig({
  APP_BASE_URL: "http://localhost:3000",
  SESSION_SECRET: "test-secret-16chars-min",
  GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec",
  GOOGLE_HOSTED_DOMAIN: "kokilmetal.com.tr",
  ADMIN_EMAILS: "boss@kokilmetal.com.tr",
  SMTP_HOST: "smtp.zoho.com", SMTP_PORT: "465", SMTP_SECURE: "true",
  MAIL_FROM: "From <f@k.com>",
});

function schema(db: Database): Database {
  db.exec(`
    CREATE TABLE requests (id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_no TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
      requester_name TEXT NOT NULL, requester_email TEXT NOT NULL,
      department TEXT NOT NULL, application TEXT NOT NULL,
      module_area TEXT NOT NULL DEFAULT '', request_type TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL,
      expected_benefit TEXT NOT NULL, priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new');
    CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id),
      author_role TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);`);
  return db;
}
function adminCookie() {
  return `session=${signSession({ email: "boss@kokilmetal.com.tr", name: "Boss" }, cfg.sessionSecret)}; csrf=test-csrf`;
}
function userCookie() {
  return `session=${signSession({ email: "a@kokilmetal.com.tr", name: "A" }, cfg.sessionSecret)}; csrf=test-csrf`;
}

let repo: Repo;
let sent: any[];
let app: ReturnType<typeof buildApp>;

const sample = {
  requester_name: "A", requester_email: "a@kokilmetal.com.tr",
  department: "d", application: "ERP", module_area: "",
  request_type: "feature", title: "t", description: "d",
  expected_benefit: "f", priority: "high",
};

beforeEach(() => {
  repo = makeRepo(schema(new Database(":memory:")));
  sent = [];
  app = buildApp({
    config: cfg, repo,
    mailer: makeMailer({ async sendMail(m: any) { sent.push(m); return {}; } }, cfg.mailFrom),
    now: () => "2026-06-12T00:00:00Z",
  });
});

describe("admin guard", () => {
  test("non-admin gets 403 on /admin", async () => {
    const res = await app.request("/admin", { headers: { Cookie: userCookie() } });
    expect(res.status).toBe(403);
  });
});

describe("admin message", () => {
  test("adds question, sets clarifying, emails requester", async () => {
    const r = repo.createRequest(sample, "t");
    const res = await app.request(`/admin/requests/${r.id}/message`, {
      method: "POST",
      headers: { Cookie: adminCookie(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ _csrf: "test-csrf", body: "Hangi parametreler?" }).toString(),
    });
    expect(res.status).toBe(302);
    expect(repo.getRequest(r.id)?.status).toBe("clarifying");
    expect(sent.some((m) => m.to === "a@kokilmetal.com.tr")).toBe(true);
  });
});

describe("admin decision", () => {
  test("reject without reason -> 400", async () => {
    const r = repo.createRequest(sample, "t");
    const res = await app.request(`/admin/requests/${r.id}/decision`, {
      method: "POST",
      headers: { Cookie: adminCookie(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ _csrf: "test-csrf", decision: "reject" }).toString(),
    });
    expect(res.status).toBe(400);
  });
  test("reject with reason sets rejected + logs reason message", async () => {
    const r = repo.createRequest(sample, "t");
    const res = await app.request(`/admin/requests/${r.id}/decision`, {
      method: "POST",
      headers: { Cookie: adminCookie(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ _csrf: "test-csrf", decision: "reject", reason: "kapsam dışı" }).toString(),
    });
    expect(res.status).toBe(302);
    expect(repo.getRequest(r.id)?.status).toBe("rejected");
    expect(repo.listMessages(r.id).some((m) => m.body === "kapsam dışı")).toBe(true);
  });
  test("accept then second decision -> 409 (terminal)", async () => {
    const r = repo.createRequest(sample, "t");
    await app.request(`/admin/requests/${r.id}/decision`, {
      method: "POST",
      headers: { Cookie: adminCookie(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ _csrf: "test-csrf", decision: "accept" }).toString(),
    });
    const res = await app.request(`/admin/requests/${r.id}/decision`, {
      method: "POST",
      headers: { Cookie: adminCookie(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ _csrf: "test-csrf", decision: "reject", reason: "x" }).toString(),
    });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 3: Run all tests**

Run: `bun test`
Expected: PASS — domain, db, auth, mail, public, admin tüm testler yeşil.

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin.ts src/routes/admin.test.ts
git commit -m "feat: admin question and accept/reject decision routes"
```

---

## Task 14: Entry point + README

**Files:**
- Create: `src/index.ts`, `README.md`

- [ ] **Step 1: index.ts yaz**

```typescript
// src/index.ts
import { loadConfig } from "./config";
import { openDb } from "./db/db";
import { makeRepo } from "./db/repo";
import { makeMailer, transportFromConfig } from "./mail/mailer";
import { buildApp } from "./app";

const config = loadConfig(process.env);
const db = openDb(config.dbPath);
const repo = makeRepo(db);
const mailer = makeMailer(transportFromConfig(config), config.mailFrom);
const app = buildApp({
  config,
  repo,
  mailer,
  now: () => new Date().toISOString(),
});

console.log(`Talep Portalı çalışıyor: ${config.appBaseUrl} (port ${config.port})`);
export default { port: config.port, fetch: app.fetch };
```

- [ ] **Step 2: README.md yaz**

```markdown
# Talep Portalı

Çalışan talebi toplama + netleştirme + kabul/ret portalı. Bun + Hono + SQLite.

## Kurulum
1. `bun install`
2. `cp .env.example .env` ve değerleri doldur (Google OAuth, Zoho SMTP, admin e-postaları).
3. Google Cloud Console: OAuth 2.0 Client → redirect URI `${APP_BASE_URL}/auth/google/callback`.
4. `bun run dev` (geliştirme) veya `bun run start` (üretim).

## Test
`bun test`

## Yedekleme
`data.db` dosyasını kopyala.
```

- [ ] **Step 3: Smoke test (manuel)**

Run: `bun run start` (geçerli `.env` ile)
Expected: "Talep Portalı çalışıyor" log'u; `/` login sayfasına yönlendirir.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts README.md
git commit -m "feat: server entry point and readme"
```

---

## Self-Review (yazar kontrolü — tamamlandı)

- **Spec coverage:** §3 mimari→Task 1/12; §4 veri modeli→Task 7; §5 durum→Task 3+route'lar; §6 sayfalar→Task 11/12/13; §7 mail→Task 10+route'lar; §8 güvenlik (OAuth hd, session, authz, CSRF, validation)→Task 6/8/9/12; §9 test→her task TDD; §11 env→Task 1/2. Tümü karşılandı.
- **Placeholder:** yok; tüm kod blokları tam.
- **Type tutarlılığı:** `RequestStatus` slug'ları, `Repo` metod adları (`createRequest/getRequest/listByEmail/listAll/addMessage/listMessages/updateStatus`), `Deps`/`AppEnv` arayüzü tüm task'larda birebir aynı.
- **Bilinen sıra bağımlılığı:** `app.ts` üç route modülünü import ettiğinden Task 12 testleri Task 13'teki `admin.ts` yazılmadan yeşillenmez (Task 12 Step 6 notu). İki task ardışık yürütülür.
```
