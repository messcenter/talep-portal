# React + shadcn Görünüm Katmanı Migrasyonu — Tasarım

- **Tarih:** 2026-06-12
- **Durum:** Onay bekliyor
- **Kapsam:** Yalnız görünüm katmanı (frontend). Backend iş mantığı dokunulmaz.
- **Kaynak tasarım:** Stitch projesi `9132225055990929415` ("Industrial Utility System"
  design.md + 5 ekran).

## 1. Amaç

Mevcut string-HTML görünüm katmanını (`src/views/views.ts`, Tailwind CDN) **gerçek React
ile sunucu-tarafı render edilen (SSR) bileşenlere + shadcn/ui'a** taşımak. Stitch'te
üretilen kurumsal/endüstriyel tasarımı portala uygulamak.

Çalışan ve güvenli backend (status FSM, OAuth, session+CSRF, mail, storage, testler)
**korunur**; sadece görünüm değişir.

## 2. Karar Kaydı (brainstorm çıktısı)

| Karar | Seçim | Gerekçe |
|---|---|---|
| Tasarım kaynağı | Stitch (HTML/Tailwind çıktısı) | Token paleti durum makinesiyle birebir uyumlu |
| UI kütüphanesi | React + shadcn/ui | Kullanıcı kararı |
| Barındırma | **Hono + SSR React** (Seçenek 3) | Backend ve auth/CSRF korunur; en az risk |
| React runtime | **Gerçek React** (`react-dom/server`), hono/jsx **değil** | shadcn/Radix gerçek React + ReactDOM ister |
| Etkileşim | **Minimum island** | CSRF cookie modeli SSR form-POST'a dayanır; korunmalı |
| Form select'leri | Native `<select>` (stillenmiş) | CSRF formuyla uyumlu, sıfır JS; sonradan yükseltilebilir |

## 3. Mimari

### 3.1 Değişmeyen (dokunulmuyor)
`src/domain/`, `src/db/`, `src/auth/`, `src/mail/`, `src/storage/`, `src/config.ts`
ve tüm `*.test.ts` dosyaları. Session + CSRF cookie modeli, Google OAuth, status FSM
(`new→clarifying↔answered→accepted/rejected`) aynen kalır. `Deps` DI yapısı korunur.

### 3.2 Değişen

| Eski | Yeni |
|---|---|
| `src/views/views.ts` (string HTML) | `src/views/*.tsx` (React bileşenleri) |
| `layout(title, body, user)` | `<Layout title user>{children}</Layout>` |
| Route: `c.html(myList(...))` | Route: `c.html(render(<MyList .../>))` |
| Tailwind CDN `<script>` | Derlenmiş statik CSS `public/app.css` |
| (yok) | `src/client/*` → `public/client.js` (island hydrate) |
| (yok) | `src/components/ui/*` (shadcn bileşenleri, CLI ile) |

`render()` = `react-dom/server`'ın `renderToString`'ünü saran ince yardımcı; `<!doctype html>`
+ `<html>` iskeletini üretir, `public/app.css` ve (gerekirse) `public/client.js` linkler.

### 3.3 Yeni bağımlılıklar
`react`, `react-dom`, `tailwindcss`, `@radix-ui/react-*` (kullanılan primitive'ler),
`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`. Tip paketleri:
`@types/react`, `@types/react-dom`.

## 4. Ekran → Bileşen Eşlemesi

| Stitch ekranı | Yeni bileşen | Karşılık (eski) | Island |
|---|---|---|---|
| Giriş | `LoginPage.tsx` | `loginPage` | Hayır |
| Yeni Talep Formu | `NewRequestForm.tsx` | `newRequestForm` | Hayır |
| Taleplerim Listesi | `MyList.tsx` | `myList` | Hayır |
| Talep Detayı + Yazışma | `RequestDetail.tsx` + `Thread.tsx` + `Attachments.tsx` | `requestDetail`/`thread`/`attachmentChips` | Kısmi |
| Admin Paneli | `AdminList.tsx` | `adminList` | Kısmi |
| Ortak iskelet | `Layout.tsx` | `layout` | Hayır |
| Bilgi/hata sayfası | `NoticePage.tsx` | `noticePage` | Hayır |

## 5. Island Sınırları (minimum prensibi)

Çoğu sayfa **sıfır client JS** ile çalışır. Native `<form method="post">` + CSRF hidden
field korunur; shadcn yalnız görsel giydirme için kullanılır.

**Native kalanlar (island yok):** tüm form submit'leri, dosya yükleme input'u, native
`<select>`, durum rozetleri, tablolar, mesaj thread'i, navigasyon.

**Island olanlar (hydrate edilir):**
- **Ret onay dialog'u** — admin "Ret" aksiyonu shadcn `Dialog` içinde gerekçe ister;
  dialog içi yine native form POST (CSRF korunur).
- **Toast/flash** (opsiyonel) — başarı/hata bildirimleri. Native banner ile de yapılabilir;
  island zorunlu değil.
- **Admin satır aksiyon menüsü** (opsiyonel) — shadcn `DropdownMenu`; native link'lerle de olur.

Her island ayrı bir entry; tek `public/client.js` bundle'a derlenir. Hydration yalnız
o island'ın mount noktasında olur (tam sayfa hydrate yok).

## 6. Build / Dev Akışı

İki derleme ürünü, ikisi de `public/`:
1. **CSS:** `src/styles/app.css` (Stitch token'ları `@theme` + `tailwind.config`) →
   `tailwindcss` CLI → `public/app.css`.
2. **Island JS:** `src/client/*` → `bun build` → `public/client.js`.

Hono `public/`'i statik serve eder (`hono/bun` `serveStatic`).

**package.json script'leri:**
- `bun run dev` → tailwind `--watch` + `bun build --watch` + `bun --watch src/index.ts` (paralel).
- `bun run build` → CSS + island bundle (tek sefer, üretim).
- `bun run start` → `build` sonrası sunucu.

## 7. Test Stratejisi

CLAUDE.md gate'i korunur: **`bun test` yeşil olmadan commit yok.**

- **Backend testleri değişmez** — `domain`/`db`/`auth`/`mail`/`storage` testleri aynen
  yeşil kalmalı. Migration bunları kırmamalı; kırılırsa migration hatasıdır.
- **Route entegrasyon testleri** — route'lar hâlâ HTML string döndürür (SSR React →
  string). İçerik assertion'ları (Türkçe label, durum, `_csrf` hidden field, IDOR/404,
  CSRF reddi) çoğunlukla geçer; markup birebir değişimi nedeniyle kırılanlar TDD ile
  güncellenir.
- **Yeni bileşen birim testleri** — `renderToString(<NewRequestForm .../>)` çıktısında
  zorunlu alanlar + CSRF token + escape doğrulanır.
- **Island'lar** — ağır test yok; gerekirse manuel/Playwright opsiyonel.

## 8. CLAUDE.md Güncellemesi (bu işin parçası)

Şu load-bearing ifadeler geçersiz kalıyor, güncellenecek:
- §1: "frontend build adımı yok" → build adımı var (CSS + island).
- §1: "Tailwind CDN" → derlenmiş statik CSS.
- §2 katman tablosu: `src/views/` "saf string HTML render" → "saf React (SSR) render,
  I/O yok"; `src/client/` ve `src/components/ui/` satırları eklenir.

## 9. Kapsam Dışı (YAGNI)

- Tam SPA / client-side routing — yok.
- Token-bazlı auth — yok; cookie+CSRF korunur.
- Next.js — yok.
- shadcn'in fancy `Select`/`Combobox`'ı form'larda — başlangıçta native `<select>`;
  sonradan yükseltilebilir.
- Yeni özellik/akış — yok; yalnız görünüm migrasyonu (davranış eşdeğer).

## 10. Riskler

- **shadcn CLI hono/jsx beklemiyor** — bileşenler `src/components/ui/`'a kopyalanır,
  gerçek React kullanıldığı için sorun olmamalı; CLI config (`components.json`) elle
  ayarlanabilir.
- **Route testlerinde markup kırılması** — beklenen; TDD ile tek tek güncellenir.
- **Bundle/derleme dev deneyimi** — üç paralel watch; Bun ile yönetilebilir, gerekirse
  tek dev orchestrator script.
