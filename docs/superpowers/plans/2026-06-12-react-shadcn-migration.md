# React + shadcn Görünüm Migrasyonu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut string-HTML görünüm katmanını, davranışı birebir koruyarak gerçek React (SSR) + shadcn/ui + Stitch tasarım token'larına taşımak.

**Architecture:** `src/views/views.ts`'in dışa açık fonksiyon imzaları korunur; her biri içeride `render(<Component/>)` döndürür. Route'lar ve backend (`domain`/`db`/`auth`/`mail`/`storage`) dokunulmaz. Tailwind CDN → derlenmiş `public/app.css`. İnteraktif parçalar minimum island olarak `public/client.js`'te hydrate edilir.

**Tech Stack:** Bun, Hono, React 18 (`react-dom/server`), Tailwind CSS 3 (CLI), shadcn/ui (Radix + cva + clsx + tailwind-merge), lucide-react.

---

## Strateji: Testleri Yeşil Tutmak

Route entegrasyon testleri içerik/attribute assertion'larına bakar (`"Google ile giriş"`, `"Yeni Talep"`, `enctype="multipart/form-data"`, `type="file"`, `name="_csrf" value="..."`, `<img src="/requests/.../attachments/`, `"sartname.pdf"`). React bileşenleri **aynı semantik HTML'i** (aynı form action/method/enctype, aynı `_csrf` hidden input, aynı `<img src>`, aynı Türkçe metinler) üretirse bu testler değişmeden geçer. Stilleri (class) serbestçe Stitch tasarımına çeviririz — testler class'lara bakmıyor.

`src/views/views.ts`'in **dışa açık page fonksiyonları** (`loginPage`, `newRequestForm`, `myList`, `requestDetail`, `adminList`, `noticePage`) korunur; iç yardımcılar (`layout`, `thread`, `requestRow`, `attachmentChips`, `esc`) React bileşenlerine dönüşür.

## File Structure

```
src/
  render.tsx                 # YENİ: renderToStaticMarkup saran render() + html iskeleti
  lib/cn.ts                  # YENİ: clsx + tailwind-merge yardımcı
  components/ui/
    button.tsx               # YENİ: shadcn Button
    badge.tsx                # YENİ: shadcn Badge (+ status varyantları)
    card.tsx                 # YENİ: shadcn Card
    dialog.tsx               # YENİ: shadcn Dialog (island için, Task 10)
  views/
    views.ts                 # DEĞİŞİR: page fonksiyonları render(<.../>) döndürür
    components/
      Layout.tsx             # YENİ: ortak iskelet (eski layout)
      LoginPage.tsx          # YENİ
      NewRequestForm.tsx     # YENİ
      MyList.tsx             # YENİ (+ RequestCard)
      RequestDetail.tsx      # YENİ (+ Thread + Attachments)
      AdminList.tsx          # YENİ
      NoticePage.tsx         # YENİ
      StatusBadge.tsx        # YENİ: durum slug → renkli rozet
  styles/
    app.css                  # YENİ: Tailwind direktifleri + @layer base
  client/
    index.ts                 # YENİ (Task 10): island hydrate giriş noktası
tailwind.config.ts           # YENİ: Stitch token'ları
public/                      # YENİ: app.css + client.js derleme çıktısı (gitignore)
```

---

## Task 1: Build altyapısı + bağımlılıklar + render() helper

**Files:**
- Modify: `package.json` (deps + scripts)
- Modify: `tsconfig.json` (jsx)
- Create: `tailwind.config.ts`
- Create: `src/styles/app.css`
- Create: `src/lib/cn.ts`
- Create: `src/render.tsx`
- Test: `src/render.test.tsx`
- Modify: `.gitignore` (public/)
- Modify: `src/app.ts` (serveStatic for /app.css, /client.js)

- [ ] **Step 1: Bağımlılıkları kur**

Run:
```bash
bun add react react-dom class-variance-authority clsx tailwind-merge lucide-react
bun add -d @types/react @types/react-dom tailwindcss @radix-ui/react-dialog
```
Expected: `package.json` dependencies güncellenir, kurulum başarılı.

- [ ] **Step 2: tsconfig'e JSX ayarı ekle**

`tsconfig.json` içindeki `compilerOptions`'a ekle:
```json
    "jsx": "react-jsx",
    "jsxImportSource": "react"
```
(Mevcut anahtarların yanına; trailing virgüllere dikkat.)

- [ ] **Step 3: tailwind.config.ts oluştur (Stitch token'ları)**

Create `tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: "#f9f9fe", tonal: "#F8FAFC", container: "#ededf3" },
        "border-subtle": "#E2E8F0",
        primary: { DEFAULT: "#0F4C81", fg: "#ffffff" },
        secondary: { DEFAULT: "#546E7A", fg: "#ffffff" },
        "on-surface": { DEFAULT: "#191c1f", variant: "#42474f" },
        status: {
          yeni: "#1976D2",
          netlestiriliyor: "#F57C00",
          kabul: "#2E7D32",
          ret: "#C62828",
        },
        danger: { DEFAULT: "#C62828", fg: "#ffffff" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: { DEFAULT: "0.25rem", lg: "0.5rem", xl: "0.75rem" },
      maxWidth: { container: "1280px" },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 4: src/styles/app.css oluştur**

Create `src/styles/app.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  body { @apply bg-surface text-on-surface; }
}
```

- [ ] **Step 5: src/lib/cn.ts oluştur**

Create `src/lib/cn.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: render() helper için başarısız test yaz**

Create `src/render.test.tsx`:
```tsx
import { expect, test } from "bun:test";
import { render } from "./render";

test("render wraps markup in a full html document with css link", () => {
  const html = render("Test", <p>merhaba</p>);
  expect(html.startsWith("<!doctype html>")).toBe(true);
  expect(html).toContain('lang="tr"');
  expect(html).toContain('<link rel="stylesheet" href="/app.css">');
  expect(html).toContain("merhaba");
  expect(html).toContain("Test");
});

test("render escapes nothing it should not and renders children verbatim text", () => {
  const html = render("X", <span>{"a&b"}</span>);
  expect(html).toContain("a&amp;b");
});
```

- [ ] **Step 7: Testi çalıştır, başarısız olduğunu doğrula**

Run: `bun test src/render.test.tsx`
Expected: FAIL — `Cannot find module "./render"`.

- [ ] **Step 8: render.tsx implement et**

Create `src/render.tsx`:
```tsx
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

// SSR helper: render a React tree to a full HTML document string.
// Mirrors the old layout()'s doctype + html skeleton, but content is React.
export function render(title: string, body: ReactElement): string {
  return "<!doctype html>" + renderToStaticMarkup(
    <html lang="tr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{`${title} · Talep Portalı`}</title>
        <link rel="stylesheet" href="/app.css" />
      </head>
      {body}
    </html>,
  );
}
```
Not: `body` parametresi `<body>...</body>` elementidir (Layout bunu sağlar).

- [ ] **Step 9: Testi çalıştır, geçtiğini doğrula**

Run: `bun test src/render.test.tsx`
Expected: PASS (2 test).

- [ ] **Step 10: .gitignore'a public/ ekle**

`.gitignore` dosyasına ekle:
```
public/
```

- [ ] **Step 11: package.json script'lerini güncelle**

`package.json` `scripts` bloğunu şu hale getir:
```json
  "scripts": {
    "build:css": "tailwindcss -i src/styles/app.css -o public/app.css --minify",
    "build:client": "bun build src/client/index.ts --outfile public/client.js --minify",
    "build": "bun run build:css && bun run build:client",
    "dev:css": "tailwindcss -i src/styles/app.css -o public/app.css --watch",
    "dev:server": "bun run --watch src/index.ts",
    "dev": "bun run build:css && (bun run dev:css & bun run dev:server)",
    "start": "bun run build && bun run src/index.ts",
    "test": "bun test"
  }
```
Not: `build:client` Task 10'da `src/client/index.ts` oluşana kadar başarısız olur; o yüzden `build` script'i Task 10'dan önce sadece `build:css` çalıştırmalı. Geçici olarak Task 1'de `"build": "bun run build:css"` bırak, Task 10'da `build:client`'ı ekle.

Task 1 için `build` ve `start`:
```json
    "build": "bun run build:css",
    "start": "bun run build && bun run src/index.ts",
    "dev": "bun run build:css && (bun run dev:css & bun run dev:server)",
```

- [ ] **Step 12: app.ts'e statik dosya servisi ekle**

`src/app.ts` başına import ekle:
```ts
import { serveStatic } from "hono/bun";
```
`buildApp` içinde, auth middleware'inden ÖNCE (statik varlıklar auth gerektirmez), `const app = new Hono<AppEnv>();` satırından hemen sonra ekle:
```ts
  app.get("/app.css", serveStatic({ path: "./public/app.css" }));
  app.get("/client.js", serveStatic({ path: "./public/client.js" }));
```

- [ ] **Step 13: Tüm testlerin yeşil olduğunu doğrula**

Run: `bun test`
Expected: PASS (mevcut tüm testler + 2 yeni render testi).

- [ ] **Step 14: CSS derlemesinin çalıştığını doğrula**

Run: `bun run build:css && head -c 80 public/app.css`
Expected: Derlenmiş CSS üretilir (içerik döner, hata yok).

- [ ] **Step 15: Commit**

```bash
git add package.json tsconfig.json tailwind.config.ts src/styles src/lib src/render.tsx src/render.test.tsx .gitignore src/app.ts
git commit -m "build: add React SSR + Tailwind build pipeline and render helper"
```

---

## Task 2: shadcn primitive bileşenleri (Button, Badge, Card, StatusBadge)

**Files:**
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/views/components/StatusBadge.tsx`
- Test: `src/views/components/StatusBadge.test.tsx`

- [ ] **Step 1: Button bileşeni oluştur**

Create `src/components/ui/button.tsx`:
```tsx
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded font-semibold text-sm transition-colors disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg hover:bg-[#0d4271]",
        secondary: "border border-secondary text-secondary hover:bg-surface-tonal",
        danger: "bg-danger text-danger-fg hover:bg-[#a81f1f]",
        success: "bg-status-kabul text-white hover:bg-[#256628]",
      },
      size: { md: "px-4 py-2", sm: "px-3 py-1" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
```

- [ ] **Step 2: Card bileşeni oluştur**

Create `src/components/ui/card.tsx`:
```tsx
import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("bg-white border border-border-subtle rounded-lg", className)}
      {...props}
    />
  );
}
```

- [ ] **Step 3: Badge bileşeni oluştur**

Create `src/components/ui/badge.tsx`:
```tsx
import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-semibold",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 4: StatusBadge için başarısız test yaz**

Create `src/views/components/StatusBadge.test.tsx`:
```tsx
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge } from "./StatusBadge";

test("StatusBadge renders Turkish label for slug", () => {
  const html = renderToStaticMarkup(<StatusBadge status="clarifying" />);
  expect(html).toContain("Netleştiriliyor");
});

test("StatusBadge renders accepted label", () => {
  const html = renderToStaticMarkup(<StatusBadge status="accepted" />);
  expect(html).toContain("Kabul edildi");
});
```

- [ ] **Step 5: Testi çalıştır, başarısız olduğunu doğrula**

Run: `bun test src/views/components/StatusBadge.test.tsx`
Expected: FAIL — `Cannot find module "./StatusBadge"`.

- [ ] **Step 6: StatusBadge implement et**

Create `src/views/components/StatusBadge.tsx`:
```tsx
import { statusLabelTr, type RequestStatus } from "../../domain/status";
import { Badge } from "../../components/ui/badge";

const TINT: Record<RequestStatus, string> = {
  new: "bg-status-yeni/10 text-status-yeni",
  clarifying: "bg-status-netlestiriliyor/10 text-status-netlestiriliyor",
  answered: "bg-status-netlestiriliyor/10 text-status-netlestiriliyor",
  accepted: "bg-status-kabul/10 text-status-kabul",
  rejected: "bg-status-ret/10 text-status-ret",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <Badge className={TINT[status]}>{statusLabelTr(status)}</Badge>;
}
```
Not: `statusLabelTr` ve `RequestStatus` mevcut `src/domain/status.ts`'ten gelir. Etiketler: `new`→"Yeni", `clarifying`→"Netleştiriliyor", `answered`→"Cevaplandı", `accepted`→"Kabul edildi", `rejected`→"Reddedildi".

- [ ] **Step 7: Testi çalıştır, geçtiğini doğrula**

Run: `bun test src/views/components/StatusBadge.test.tsx`
Expected: PASS (2 test).

- [ ] **Step 8: Commit**

```bash
git add src/components/ui src/views/components/StatusBadge.tsx src/views/components/StatusBadge.test.tsx
git commit -m "feat: add shadcn primitives (Button, Card, Badge) and StatusBadge"
```

---

## Task 3: Layout bileşeni

**Files:**
- Create: `src/views/components/Layout.tsx`
- Modify: `src/views/views.ts` (internal `layout` helper → React; geçici köprü)

Bu task'ta `Layout.tsx` oluşturulur ama henüz hiçbir page onu kullanmaz; `views.ts`'in iç `layout()` helper'ı string üretmeye devam eder. Page'ler Task 4-9'da tek tek React'e geçerken Layout'u kullanır. Bu task sadece Layout'u hazırlar.

- [ ] **Step 1: Layout bileşenini oluştur**

Create `src/views/components/Layout.tsx`:
```tsx
import type { ReactNode } from "react";

export function Layout({
  user,
  children,
}: {
  user?: { name: string };
  children: ReactNode;
}) {
  return (
    <body className="bg-surface text-on-surface min-h-screen">
      <header className="bg-white border-b border-border-subtle">
        <div className="max-w-container mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/" className="font-semibold text-primary">Talep Portalı</a>
          <nav className="text-sm flex gap-4 items-center">
            <a href="/my" className="hover:underline">Taleplerim</a>
            {user ? (
              <>
                <span className="text-on-surface-variant">{user.name}</span>
                <form method="post" action="/logout">
                  <button className="hover:underline">Çıkış</button>
                </form>
              </>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </body>
  );
}
```
Not: `<body>` döndürür çünkü `render(title, body)` bunu `<html>` içine koyar. Logout formu kasıtlı olarak `_csrf` taşımaz (mevcut sözleşme: `/logout` CSRF muaf).

- [ ] **Step 2: Derleme/tip kontrolü**

Run: `bun test src/render.test.tsx`
Expected: PASS (Layout import edilince tip hatası olmamalı; henüz kullanılmıyor).

- [ ] **Step 3: Commit**

```bash
git add src/views/components/Layout.tsx
git commit -m "feat: add React Layout component"
```

---

## Task 4: LoginPage migrasyonu

**Files:**
- Create: `src/views/components/LoginPage.tsx`
- Modify: `src/views/views.ts` (`loginPage` → `render(<LoginPage/>)`)
- Test (mevcut): `src/routes/public.test.ts:85` ("Google ile giriş")

- [ ] **Step 1: Mevcut testin geçtiğini baz al**

Run: `bun test src/routes/public.test.ts -t "login"`
Expected: PASS (migrasyon öncesi yeşil — referans).

- [ ] **Step 2: LoginPage bileşenini oluştur**

Create `src/views/components/LoginPage.tsx`:
```tsx
import { Card } from "../../components/ui/card";
import { Layout } from "./Layout";

export function LoginPage() {
  return (
    <Layout>
      <Card className="p-8 text-center max-w-md mx-auto mt-12">
        <h1 className="text-2xl font-bold mb-2 text-primary">Talep Portalı</h1>
        <p className="text-on-surface-variant mb-6">
          Devam etmek için kurumsal hesabınızla giriş yapın.
        </p>
        <a
          href="/auth/google"
          className="inline-block bg-primary text-primary-fg px-5 py-2 rounded font-semibold"
        >
          Google ile giriş
        </a>
      </Card>
    </Layout>
  );
}
```

- [ ] **Step 3: views.ts'te loginPage'i React'e bağla**

`src/views/views.ts` içinde mevcut `loginPage` fonksiyonunu şununla değiştir:
```ts
export function loginPage(): string {
  return render("Giriş", <LoginPage />);
}
```
Dosya başına import ekle:
```ts
import { render } from "../render";
import { LoginPage } from "./components/LoginPage";
```
Not: `views.ts` artık JSX içerdiği için **`src/views/views.tsx`'e yeniden adlandır**. Tüm import edenler (`app.ts`, `routes/public.ts`, `routes/admin.ts`) `"../views/views"` (uzantısız) kullanıyor; bundler `.tsx`'i çözer, import satırları değişmez.

Run: `git mv src/views/views.ts src/views/views.tsx`

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `bun test src/routes/public.test.ts -t "login"`
Expected: PASS — "Google ile giriş" hâlâ render ediliyor.

- [ ] **Step 5: Tüm testler yeşil mi**

Run: `bun test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/views.tsx src/views/components/LoginPage.tsx
git commit -m "feat: migrate login page to React"
```

---

## Task 5: NewRequestForm migrasyonu

**Files:**
- Create: `src/views/components/NewRequestForm.tsx`
- Modify: `src/views/views.tsx` (`newRequestForm` → React)
- Test (mevcut): `src/routes/public.test.ts:92,97,98,107`

Mevcut `newRequestForm(user, csrf, errors?)` imzası korunur. Form: `method=post action=/requests enctype=multipart/form-data`, `_csrf` hidden, alanlar: department, application(varsayılan "ERP"), module_area(ops), request_type(select: REQUEST_TYPES), title, description, expected_benefit, priority(select: PRIORITIES), files(file, multiple). `REQUEST_TYPES`/`PRIORITIES` ve `TYPE_TR`/`PRIO_TR` mevcut `validation.ts`/`views`'ten gelir.

- [ ] **Step 1: NewRequestForm bileşenini oluştur**

Create `src/views/components/NewRequestForm.tsx`:
```tsx
import { REQUEST_TYPES, PRIORITIES } from "../../domain/validation";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Layout } from "./Layout";

const TYPE_TR: Record<string, string> = { feature: "Yeni Özellik", bug: "Hata", task: "Görev" };
const PRIO_TR: Record<string, string> = { low: "Düşük", medium: "Orta", high: "Yüksek" };

const inputCls =
  "w-full border border-border-subtle rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="block text-xs font-semibold uppercase tracking-wide mb-1 text-on-surface-variant">
        {label}
      </span>
      {children}
    </label>
  );
}

export function NewRequestForm({
  user,
  csrf,
  errors,
}: {
  user: { name: string };
  csrf: string;
  errors?: string[];
}) {
  return (
    <Layout user={user}>
      <h1 className="text-2xl font-bold mb-4">Yeni Talep</h1>
      {errors?.length ? (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded p-3 mb-4">
          <ul className="list-disc pl-5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <Card className="p-6">
        <form method="post" action="/requests" encType="multipart/form-data">
          <input type="hidden" name="_csrf" value={csrf} />
          <Field label="Departman">
            <input className={inputCls} name="department" required />
          </Field>
          <Field label="Uygulama">
            <input className={inputCls} name="application" defaultValue="ERP" required />
          </Field>
          <Field label="Modül/Alan (opsiyonel)">
            <input className={inputCls} name="module_area" />
          </Field>
          <Field label="Talep Türü">
            <select className={inputCls} name="request_type" required>
              {REQUEST_TYPES.map((v) => (
                <option key={v} value={v}>{TYPE_TR[v] ?? v}</option>
              ))}
            </select>
          </Field>
          <Field label="Başlık">
            <input className={inputCls} name="title" required />
          </Field>
          <Field label="Açıklama">
            <textarea className={inputCls} name="description" rows={4} required />
          </Field>
          <Field label="Beklenen Fayda">
            <textarea className={inputCls} name="expected_benefit" rows={2} required />
          </Field>
          <Field label="Öncelik">
            <select className={inputCls} name="priority" required>
              {PRIORITIES.map((v) => (
                <option key={v} value={v}>{PRIO_TR[v] ?? v}</option>
              ))}
            </select>
          </Field>
          <Field label="Ekler (opsiyonel)">
            <input
              type="file"
              name="files"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
              className="block w-full text-sm"
            />
          </Field>
          <Button type="submit">Talep Gönder</Button>
        </form>
      </Card>
    </Layout>
  );
}
```
Not: `Card`'a `asChild` yok; eğer `Card` form'u sarmalarken stil çakışırsa form'u `Card` dışında bırakıp `Card` className'lerini doğrudan `<form>`'a verebilirsin. Yukarıdaki kullanımda `Card` bir `<div>` döndürür ve `<form>`'u içerir — geçerli.

> **Uyum kontrolü:** Mevcut `views.tsx`'teki alan adlarının (`name=...`) ve sırasının orijinal `newRequestForm` ile birebir aynı olduğundan emin ol; `newRequestSchema` bu adlara bağlı.

- [ ] **Step 2: views.tsx'te newRequestForm'u bağla**

`src/views/views.tsx` içindeki `newRequestForm` gövdesini değiştir:
```ts
export function newRequestForm(
  user: { name: string },
  csrf: string,
  errors?: string[],
): string {
  return render("Yeni Talep", <NewRequestForm user={user} csrf={csrf} errors={errors} />);
}
```
Import ekle: `import { NewRequestForm } from "./components/NewRequestForm";`
Eski `newRequestForm` içindeki yerel `opt`/`field`/`input` yardımcıları artıksa kaldır (TYPE_TR/PRIO_TR başka yerde kullanılmıyorsa onları da).

- [ ] **Step 3: Testleri çalıştır, geçtiğini doğrula**

Run: `bun test src/routes/public.test.ts`
Expected: PASS — "Yeni Talep", `enctype="multipart/form-data"`, `type="file"`, `name="_csrf" value="test-csrf"` hepsi mevcut.

- [ ] **Step 4: Commit**

```bash
git add src/views/views.tsx src/views/components/NewRequestForm.tsx
git commit -m "feat: migrate new-request form to React + shadcn"
```

---

## Task 6: MyList + RequestCard migrasyonu

**Files:**
- Create: `src/views/components/MyList.tsx` (RequestCard dahil)
- Modify: `src/views/views.tsx` (`myList` → React; iç `requestRow` kaldırılır)
- Test (mevcut): `src/routes/public.test.ts` (my list ile ilgili assertion'lar)

- [ ] **Step 1: MyList + RequestCard oluştur**

Create `src/views/components/MyList.tsx`:
```tsx
import type { RequestRow } from "../../db/repo";
import { StatusBadge } from "./StatusBadge";
import { Layout } from "./Layout";

const PRIO_TR: Record<string, string> = { low: "Düşük", medium: "Orta", high: "Yüksek" };

export function RequestCard({ r }: { r: RequestRow }) {
  return (
    <a
      href={`/requests/${r.id}`}
      className="block bg-white border border-border-subtle rounded-lg p-4 mb-2 hover:bg-surface-tonal"
    >
      <div className="flex justify-between items-start">
        <span className="font-medium">
          <span className="font-mono text-sm text-primary">{r.request_no}</span>
          {" · "}
          {r.title}
        </span>
        <StatusBadge status={r.status} />
      </div>
      <div className="text-sm text-on-surface-variant mt-1">
        {(PRIO_TR[r.priority] ?? r.priority)} · {r.application}
      </div>
    </a>
  );
}

export function MyList({ user, rows }: { user: { name: string }; rows: RequestRow[] }) {
  return (
    <Layout user={user}>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Taleplerim</h1>
        <a href="/" className="bg-primary text-primary-fg px-4 py-2 rounded text-sm font-semibold">
          Yeni talep
        </a>
      </div>
      {rows.length ? (
        rows.map((r) => <RequestCard key={r.id} r={r} />)
      ) : (
        <p className="text-on-surface-variant">
          Henüz talebiniz yok.{" "}
          <a className="underline" href="/">Yeni talep</a> oluşturun.
        </p>
      )}
    </Layout>
  );
}
```

- [ ] **Step 2: views.tsx'te myList'i bağla, requestRow'u kaldır**

`src/views/views.tsx`:
```ts
export function myList(user: { name: string }, rows: RequestRow[]): string {
  return render("Taleplerim", <MyList user={user} rows={rows} />);
}
```
Import ekle: `import { MyList } from "./components/MyList";`
Eski `requestRow` fonksiyonunu kaldır **ANCAK** `adminList` hâlâ onu `rows.map(requestRow)` ile kullanıyor — Task 8'e kadar `requestRow`'u koru. Bu task'ta sadece `myList` gövdesini değiştir, `requestRow`'u Task 8'de kaldır.

- [ ] **Step 3: Testleri çalıştır**

Run: `bun test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/views/views.tsx src/views/components/MyList.tsx
git commit -m "feat: migrate my-requests list to React"
```

---

## Task 7: RequestDetail + Thread + Attachments migrasyonu

**Files:**
- Create: `src/views/components/Attachments.tsx`
- Create: `src/views/components/Thread.tsx`
- Create: `src/views/components/RequestDetail.tsx`
- Modify: `src/views/views.tsx` (`requestDetail` → React; iç `thread`/`attachmentChips` kaldırılır)
- Test (mevcut): `src/routes/public.test.ts:307-309` (`<img src="/requests/.../attachments/`, "sartname.pdf"), reply formu

Bu, en yoğun ekran. `requestDetail` imzası ve ürettiği semantik korunur: meta kartı, request-level ekler, "Netleştirme" başlığı, thread (mesaj balonları + mesaj ekleri), `canReply` ise reply formu, `isAdmin` ise soru-ekle + karar formu. Karar formu `accept`/`reject` butonları korunur (island Task 10'da gelir; burada native form).

- [ ] **Step 1: Attachments bileşenini oluştur**

Create `src/views/components/Attachments.tsx`:
```tsx
import type { AttachmentRow } from "../../db/repo";

export function Attachments({
  requestId,
  atts,
}: {
  requestId: number;
  atts: AttachmentRow[];
}) {
  if (!atts.length) return null;
  return (
    <div className="flex flex-wrap gap-3 mt-2">
      {atts.map((a) => {
        const url = `/requests/${requestId}/attachments/${a.id}`;
        if (a.mime.startsWith("image/")) {
          return (
            <a key={a.id} href={url} target="_blank" rel="noopener">
              <img
                src={url}
                alt={a.original_name}
                className="h-24 w-24 object-cover border border-border-subtle rounded"
              />
            </a>
          );
        }
        return (
          <a
            key={a.id}
            href={url}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 border border-border-subtle rounded px-3 py-2 text-sm bg-white hover:bg-surface-tonal"
          >
            📄 {a.original_name}
          </a>
        );
      })}
    </div>
  );
}
```
Not: `<img src={url}>` ve `original_name` korunur — testler bunlara bakıyor.

- [ ] **Step 2: Thread bileşenini oluştur**

Create `src/views/components/Thread.tsx`:
```tsx
import type { MessageRow, AttachmentRow } from "../../db/repo";
import { Attachments } from "./Attachments";

export function Thread({
  messages,
  attByMessage,
  requestId,
}: {
  messages: MessageRow[];
  attByMessage: Map<number, AttachmentRow[]>;
  requestId: number;
}) {
  if (!messages.length) {
    return <p className="text-on-surface-variant text-sm">Henüz mesaj yok.</p>;
  }
  return (
    <>
      {messages.map((m) => {
        const isAdmin = m.author_role === "admin";
        return (
          <div key={m.id} className={`mb-3 ${isAdmin ? "" : "pl-8"}`}>
            <div className="text-xs text-on-surface-variant mb-1">
              {isAdmin ? "Yönetici (soru)" : "Talep eden (cevap)"} ·{" "}
              <span className="font-mono">{m.created_at}</span>
            </div>
            <div
              className={`border rounded p-3 whitespace-pre-wrap ${
                isAdmin
                  ? "bg-surface-tonal border-border-subtle"
                  : "bg-primary/5 border-primary/20"
              }`}
            >
              {m.body}
            </div>
            <Attachments requestId={requestId} atts={attByMessage.get(m.id) ?? []} />
          </div>
        );
      })}
    </>
  );
}
```
Not: `author_role` alan adı `MessageRow`'dan gelir (mevcut kodda `m.author_role`).

- [ ] **Step 3: RequestDetail bileşenini oluştur**

Create `src/views/components/RequestDetail.tsx`:
```tsx
import type { RequestRow, MessageRow, AttachmentRow } from "../../db/repo";
import { statusLabelTr } from "../../domain/status";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Attachments } from "./Attachments";
import { Thread } from "./Thread";
import { Layout } from "./Layout";

const PRIO_TR: Record<string, string> = { low: "Düşük", medium: "Orta", high: "Yüksek" };
const inputCls = "w-full border border-border-subtle rounded px-3 py-2";
const fileAccept = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

export function RequestDetail({
  user,
  r,
  messages,
  attachments,
  canReply,
  isAdmin,
  csrf,
}: {
  user: { name: string };
  r: RequestRow;
  messages: MessageRow[];
  attachments: AttachmentRow[];
  canReply: boolean;
  isAdmin: boolean;
  csrf: string;
}) {
  const requestLevel = attachments.filter((a) => a.message_id == null);
  const byMessage = new Map<number, AttachmentRow[]>();
  for (const a of attachments) {
    if (a.message_id == null) continue;
    const list = byMessage.get(a.message_id) ?? [];
    list.push(a);
    byMessage.set(a.message_id, list);
  }
  return (
    <Layout user={user}>
      <Card className="p-4 mb-4">
        <h1 className="text-xl font-semibold">
          <span className="font-mono text-primary">{r.request_no}</span> · {r.title}
        </h1>
        <div className="text-sm text-on-surface-variant mb-2">
          {statusLabelTr(r.status)} · {(PRIO_TR[r.priority] ?? r.priority)} · {r.department}
        </div>
        <p className="whitespace-pre-wrap mb-2">{r.description}</p>
        <p className="text-sm">
          <span className="font-medium">Beklenen fayda:</span> {r.expected_benefit}
        </p>
        <Attachments requestId={r.id} atts={requestLevel} />
      </Card>

      <h2 className="font-semibold mb-2">Netleştirme</h2>
      <Thread messages={messages} attByMessage={byMessage} requestId={r.id} />

      {canReply ? (
        <Card className="p-4 mt-4">
          <form method="post" action={`/requests/${r.id}/reply`} encType="multipart/form-data">
            <input type="hidden" name="_csrf" value={csrf} />
            <textarea className={inputCls} name="body" rows={3} placeholder="Cevabınız..." required />
            <input type="file" name="files" multiple accept={fileAccept} className="block w-full text-sm mt-2" />
            <Button type="submit" className="mt-2">Cevapla</Button>
          </form>
        </Card>
      ) : null}

      {isAdmin ? (
        <>
          <Card className="p-4 mt-4">
            <form method="post" action={`/admin/requests/${r.id}/message`} encType="multipart/form-data">
              <input type="hidden" name="_csrf" value={csrf} />
              <textarea className={inputCls} name="body" rows={3} placeholder="Netleştirme sorusu..." required />
              <input type="file" name="files" multiple accept={fileAccept} className="block w-full text-sm mt-2" />
              <Button type="submit" className="mt-2">Soru ekle</Button>
            </form>
          </Card>
          <Card className="p-4 mt-4">
            <form method="post" action={`/admin/requests/${r.id}/decision`}>
              <input type="hidden" name="_csrf" value={csrf} />
              <textarea className={inputCls} name="reason" rows={2} placeholder="Karar notu / ret gerekçesi" />
              <div className="flex gap-2 mt-2">
                <Button name="decision" value="accept" variant="success">Kabul et</Button>
                <Button name="decision" value="reject" variant="danger">Reddet</Button>
              </div>
            </form>
          </Card>
        </>
      ) : null}
    </Layout>
  );
}
```
> **Uyum kontrolü:** Form action'ları (`/requests/:id/reply`, `/admin/requests/:id/message`, `/admin/requests/:id/decision`), alan adları (`body`, `files`, `reason`, `decision` value `accept`/`reject`) ve `_csrf` mevcut route'larla birebir aynı olmalı.

- [ ] **Step 4: views.tsx'te requestDetail'i bağla**

`src/views/views.tsx`:
```ts
export function requestDetail(opts: {
  user: { name: string };
  r: RequestRow;
  messages: MessageRow[];
  attachments: AttachmentRow[];
  canReply: boolean;
  isAdmin: boolean;
  csrf: string;
}): string {
  return render(opts.r.request_no, <RequestDetail {...opts} />);
}
```
Import ekle: `import { RequestDetail } from "./components/RequestDetail";`
Eski iç `thread` ve `attachmentChips` fonksiyonlarını kaldır (artık React bileşenleri var).

- [ ] **Step 5: Testleri çalıştır**

Run: `bun test src/routes/public.test.ts`
Expected: PASS — `<img src="/requests/${id}/attachments/`, "sartname.pdf", reply formu hepsi korunur.

- [ ] **Step 6: Tüm testler**

Run: `bun test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/views/views.tsx src/views/components/Attachments.tsx src/views/components/Thread.tsx src/views/components/RequestDetail.tsx
git commit -m "feat: migrate request detail + thread to React + shadcn"
```

---

## Task 8: AdminList migrasyonu

**Files:**
- Create: `src/views/components/AdminList.tsx`
- Modify: `src/views/views.tsx` (`adminList` → React; iç `requestRow` kaldırılır)
- Test (mevcut): `src/routes/admin.test.ts`

`adminList(user, rows, { status })` imzası korunur. Durum filtre sekmeleri (`/admin`, `/admin?status=<slug>`), tablo/kart listesi. Sekme slug'ları FSM ile aynı: new, clarifying, answered, accepted, rejected.

- [ ] **Step 1: AdminList oluştur**

Create `src/views/components/AdminList.tsx`:
```tsx
import type { RequestRow } from "../../db/repo";
import { statusLabelTr, type RequestStatus } from "../../domain/status";
import { RequestCard } from "./MyList";
import { Layout } from "./Layout";

const STATUSES: RequestStatus[] = ["new", "clarifying", "answered", "accepted", "rejected"];

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={`px-3 py-1 rounded ${
        active ? "bg-primary text-primary-fg" : "bg-white border border-border-subtle"
      }`}
    >
      {children}
    </a>
  );
}

export function AdminList({
  user,
  rows,
  filter,
}: {
  user: { name: string };
  rows: RequestRow[];
  filter: { status?: string };
}) {
  return (
    <Layout user={user}>
      <h1 className="text-2xl font-bold mb-4">Tüm Talepler</h1>
      <div className="flex flex-wrap gap-2 mb-4 text-sm">
        <Tab href="/admin" active={!filter.status}>Hepsi</Tab>
        {STATUSES.map((s) => (
          <Tab key={s} href={`/admin?status=${s}`} active={filter.status === s}>
            {statusLabelTr(s)}
          </Tab>
        ))}
      </div>
      {rows.length ? (
        rows.map((r) => <RequestCard key={r.id} r={r} />)
      ) : (
        <p className="text-on-surface-variant">Kayıt yok.</p>
      )}
    </Layout>
  );
}
```
Not: `RequestCard` Task 6'da `MyList.tsx`'ten export edildi; yeniden kullanılıyor (DRY).

- [ ] **Step 2: views.tsx'te adminList'i bağla, requestRow'u kaldır**

`src/views/views.tsx`:
```ts
export function adminList(
  user: { name: string },
  rows: RequestRow[],
  filter: { status?: string },
): string {
  return render("Yönetim", <AdminList user={user} rows={rows} filter={filter} />);
}
```
Import ekle: `import { AdminList } from "./components/AdminList";`
Artık `requestRow` ve `myList`'in eski string yardımcıları kullanılmıyor — kalan ölü kodu (`requestRow` string fonksiyonu, kullanılmayan `TYPE_TR`/`PRIO_TR`/`statusLabelTr` importları) temizle. `esc`'in hâlâ kullanılıp kullanılmadığını kontrol et (`routes/public.ts` ve `routes/admin.ts` `esc`'i mail için import ediyor — **`esc` export'u KORUNMALI**).

- [ ] **Step 3: Testleri çalıştır**

Run: `bun test src/routes/admin.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/views/views.tsx src/views/components/AdminList.tsx
git commit -m "feat: migrate admin list to React"
```

---

## Task 9: NoticePage migrasyonu + esc temizliği

**Files:**
- Create: `src/views/components/NoticePage.tsx`
- Modify: `src/views/views.tsx` (`noticePage` → React)
- Test (mevcut): `src/routes/admin.test.ts` (noticePage kullanan akışlar)

- [ ] **Step 1: NoticePage oluştur**

Create `src/views/components/NoticePage.tsx`:
```tsx
import { Card } from "../../components/ui/card";
import { Layout } from "./Layout";

export function NoticePage({
  user,
  title,
  message,
}: {
  user: { name: string };
  title: string;
  message: string;
}) {
  return (
    <Layout user={user}>
      <Card className="p-6">
        <h1 className="text-xl font-semibold mb-2">{title}</h1>
        <p>{message}</p>
        <a href="/my" className="underline text-sm">Taleplerime git</a>
      </Card>
    </Layout>
  );
}
```

- [ ] **Step 2: views.tsx'te noticePage'i bağla**

`src/views/views.tsx`:
```ts
export function noticePage(
  user: { name: string },
  title: string,
  message: string,
): string {
  return render(title, <NoticePage user={user} title={title} message={message} />);
}
```
Import ekle: `import { NoticePage } from "./components/NoticePage";`

- [ ] **Step 3: esc fonksiyonunu koru, ölü importları temizle**

`src/views/views.tsx` şimdi yalnız şunları içermeli: `esc` (export — mail için route'lar kullanıyor), `render`/bileşen importları ve 7 page fonksiyonu. Kullanılmayan importları (örn. `statusLabelTr` artık bileşenlerde) kaldır. `esc`'in `RequestStatus`/`statusLabelTr`'a ihtiyacı yok.

> **Doğrulama:** `grep -rn "esc(" src/routes/` → `esc`'in hâlâ import edildiğini ve export edildiğini teyit et.

- [ ] **Step 4: Tüm testler yeşil mi**

Run: `bun test`
Expected: PASS (tüm backend + route + bileşen testleri).

- [ ] **Step 5: Commit**

```bash
git add src/views/views.tsx src/views/components/NoticePage.tsx
git commit -m "feat: migrate notice page to React; finish view-layer migration"
```

---

## Task 10: Ret onay dialog'u (island)

**Files:**
- Create: `src/components/ui/dialog.tsx` (Radix tabanlı)
- Create: `src/views/components/RejectDialogIsland.tsx`
- Create: `src/client/index.ts`
- Modify: `src/views/components/RequestDetail.tsx` (karar formuna island mount noktası)
- Modify: `package.json` (`build:client` ekle)
- Modify: `src/render.tsx` (island gerektiren sayfalara `client.js` ekle)

Amaç: admin "Reddet" tıklayınca shadcn `Dialog` açılıp gerekçe ister; **JS yoksa mevcut native form fallback çalışır** (progressive enhancement). Island, mount noktasındaki `data-*` attribute'larından (request id, csrf) props okur.

- [ ] **Step 1: Dialog primitive oluştur**

Create `src/components/ui/dialog.tsx`:
```tsx
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 bg-black/40" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg border border-border-subtle p-6 w-[90vw] max-w-md shadow-lg",
          className,
        )}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogTitle = DialogPrimitive.Title;
```

- [ ] **Step 2: RejectDialogIsland oluştur**

Create `src/views/components/RejectDialogIsland.tsx`:
```tsx
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";

// Client-only island. Rendered fresh on the client over the mount point.
export function RejectDialogIsland({ requestId, csrf }: { requestId: number; csrf: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="danger">Reddet</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="font-semibold mb-2">Talebi reddet</DialogTitle>
        <form method="post" action={`/admin/requests/${requestId}/decision`}>
          <input type="hidden" name="_csrf" value={csrf} />
          <textarea
            className="w-full border border-border-subtle rounded px-3 py-2"
            name="reason"
            rows={3}
            placeholder="Ret gerekçesi"
            required
          />
          <Button name="decision" value="reject" variant="danger" className="mt-2">
            Reddet
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Client hydrate giriş noktası oluştur**

Create `src/client/index.ts`:
```ts
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { RejectDialogIsland } from "../views/components/RejectDialogIsland";

// Mount the reject dialog island wherever the server left a placeholder.
const el = document.querySelector<HTMLElement>("[data-island='reject-dialog']");
if (el) {
  const requestId = Number(el.dataset.requestId);
  const csrf = el.dataset.csrf ?? "";
  // Replace the no-JS fallback button with the interactive dialog.
  el.innerHTML = "";
  createRoot(el).render(createElement(RejectDialogIsland, { requestId, csrf }));
}
```

- [ ] **Step 4: RequestDetail karar formuna island mount noktası ekle**

`src/views/components/RequestDetail.tsx` içindeki admin karar formunda, "Reddet" butonunu bir island mount noktasıyla sar. Karar `<div className="flex gap-2 mt-2">` bloğunu şununla değiştir:
```tsx
              <div className="flex gap-2 mt-2 items-center">
                <Button name="decision" value="accept" variant="success">Kabul et</Button>
                {/* no-JS fallback: native reject button; island upgrades to dialog */}
                <span data-island="reject-dialog" data-request-id={r.id} data-csrf={csrf}>
                  <Button name="decision" value="reject" variant="danger">Reddet</Button>
                </span>
              </div>
```
Not: JS yoksa span içindeki native "Reddet" butonu aynı form'u submit eder (mevcut davranış). JS varsa island span'i temizleyip dialog'lu butonu basar.

- [ ] **Step 5: render.tsx'e client.js ekle (yalnız gerekli sayfalar)**

`src/render.tsx`'i, opsiyonel bir `withClient` bayrağı alacak şekilde güncelle:
```tsx
export function render(title: string, body: ReactElement, withClient = false): string {
  return "<!doctype html>" + renderToStaticMarkup(
    <html lang="tr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{`${title} · Talep Portalı`}</title>
        <link rel="stylesheet" href="/app.css" />
      </head>
      <>
        {body}
        {withClient ? <script src="/client.js" defer></script> : null}
      </>
    </html>,
  );
}
```
Not: `<body>` ve `<script>` aynı seviyede olmalı; React fragment ile sar. Alternatif: script'i Layout `<body>` sonuna koy. Eğer fragment `<html>` çocuğu olarak sorun çıkarırsa, `withClient` script'ini `Layout`'a prop olarak geçir.

`src/views/views.tsx` içinde `requestDetail` çağrısını güncelle:
```ts
  return render(opts.r.request_no, <RequestDetail {...opts} />, opts.isAdmin);
```
(Yalnız admin detay sayfası island'a ihtiyaç duyar.)

- [ ] **Step 6: build:client script'ini ekle**

`package.json` `scripts`:
```json
    "build:client": "bun build src/client/index.ts --outfile public/client.js --minify",
    "build": "bun run build:css && bun run build:client",
```
`dev` script'ini de client watch içerecek şekilde güncelle:
```json
    "dev:client": "bun build src/client/index.ts --outfile public/client.js --watch",
    "dev": "bun run build && (bun run dev:css & bun run dev:client & bun run dev:server)",
```

- [ ] **Step 7: Client bundle derlemesini doğrula**

Run: `bun run build:client && head -c 40 public/client.js`
Expected: Bundle üretilir (içerik döner, hata yok).

- [ ] **Step 8: Testleri çalıştır**

Run: `bun test`
Expected: PASS — admin detay sayfası hâlâ native "Reddet" butonunu içerir (testler bunu görür); island sadece tarayıcıda devreye girer.

- [ ] **Step 9: Commit**

```bash
git add src/components/ui/dialog.tsx src/views/components/RejectDialogIsland.tsx src/client src/views/components/RequestDetail.tsx src/render.tsx src/views/views.tsx package.json
git commit -m "feat: add reject-confirmation dialog island with no-JS fallback"
```

---

## Task 11: CLAUDE.md güncellemesi

**Files:**
- Modify: `CLAUDE.md` (§1 stack, §2 katman tablosu)

- [ ] **Step 1: §1'i güncelle**

`CLAUDE.md` §1'de:
- "sunucu-tarafı render HTML (Tailwind CDN)" → "sunucu-tarafı render React (react-dom/server) + derlenmiş Tailwind CSS"
- "Frontend build adımı yok." → "Frontend build: Tailwind CSS + island bundle (`bun run build`)."
- Çalıştırma bloğuna ekle: `bun run build  # CSS + island bundle (üretim)`

- [ ] **Step 2: §2 katman tablosunu güncelle**

`src/views/` satırı: "saf string HTML render" → "saf React (SSR) bileşen render; I/O yok".
Yeni satırlar ekle:
- `src/components/ui/` | shadcn primitive bileşenleri (Button/Badge/Card/Dialog) | saf sunum, I/O yok
- `src/client/` | island hydrate giriş noktası (tarayıcı) | yalnız etkileşim; iş kuralı yok
- `src/render.tsx` | React ağacını tam HTML dokümanına saran SSR helper | —

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for React + Tailwind build architecture"
```

---

## Task 12: Son doğrulama (manuel + tam test)

**Files:** (yok — doğrulama)

- [ ] **Step 1: Tam test paketi**

Run: `bun test`
Expected: PASS — istisnasız hepsi yeşil.

- [ ] **Step 2: Üretim derlemesi**

Run: `bun run build`
Expected: `public/app.css` ve `public/client.js` üretilir, hata yok.

- [ ] **Step 3: Sunucuyu başlat ve elle göz kontrolü**

Run: `bun run start` (ayrı terminal), tarayıcıda `http://localhost:<port>`:
- Giriş sayfası Stitch stiliyle render oluyor mu (Inter, primary #0F4C81).
- (Giriş sonrası) Yeni Talep formu, Taleplerim, Talep Detayı, Admin paneli görsel olarak tasarıma uyuyor mu.
- Admin detayında "Reddet" → dialog açılıyor mu (JS açık); JS kapalıyken native form çalışıyor mu.
- Durum rozetleri doğru renkte (yeni=mavi, netleştiriliyor=amber, kabul=yeşil, ret=kırmızı).

- [ ] **Step 4: finishing-a-development-branch skill'ini kullan**

Migrasyon tamamlandığında `superpowers:finishing-a-development-branch` skill'i ile branch'i kapatma seçeneklerini değerlendir.

---

## Self-Review Notları

- **Spec kapsamı:** Spec §3-8 (mimari, ekran eşlemesi, island, build, test, CLAUDE.md) → Task 1-11 ile birebir karşılanır. §9 kapsam-dışı (native select, no SPA) plana yansıdı (Task 5 native select).
- **esc korunması:** `esc` export'u route mail gövdeleri için KORUNUR (Task 8/9'da vurgulandı) — yanlışlıkla silinmemeli.
- **requestRow yaşam döngüsü:** Task 6'da string `requestRow` korunur (admin hâlâ kullanıyor), Task 8'de kaldırılır — sıralama bağımlılığı açık.
- **İmza tutarlılığı:** Tüm page fonksiyon imzaları (`loginPage`, `newRequestForm(user,csrf,errors?)`, `myList(user,rows)`, `requestDetail(opts)`, `adminList(user,rows,filter)`, `noticePage(user,title,message)`) korunur → route'lar değişmez.
- **Test yeşilliği:** Her task `bun test` ile biter; route testleri içerik/attribute assertion'larına bakar, semantik korunduğu için yeşil kalır.
