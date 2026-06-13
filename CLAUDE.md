# Talep Portalı — Çalışma Sözleşmesi

Bu dosya `talep-portal` reposunda çalışan agent'lar ve geliştiriciler için operasyon sözleşmesidir.

## 0. Amaç

Çalışanlardan ERP/yazılım talebi toplayan, her talebi **elle yazılan netleştirme
soruları** ile bir soru-cevap iş parçacığı üzerinden olgunlaştıran ve **kabul/ret**
kararına bağlayan iç araç. Önceki akışın (Google Form → Sheet → elle kopyala)
yerini alır.

- Bu bir **mess-erp modülü değil**, bağımsız iç araçtır. mess platform manifest /
  metadata kurallarına tabi değildir.
- Soruları sistem **otomatik üretmez** — admin elle yazar. AI/LLM entegrasyonu yok.
- Tasarım/plan SSoT: `docs/superpowers/specs/` + `docs/superpowers/plans/`.

## 1. Stack & Çalıştırma

- **Bun + `Bun.serve` (framework yok) + SQLite (`bun:sqlite`) JSON API**; istemci
  tarafı **React SPA** (React 19 + shadcn/ui + Tailwind, `bun build` ile bundle'lanır),
  nodemailer (Zoho SMTP), Zod.
- Tek process, tek `data.db` dosyası + `uploads/` ek klasörü. **Yedek = `data.db`
  dosyasını ve `uploads/` klasörünü birlikte kopyala.**
- Giriş: Google Workspace OAuth, `hd=kokilmetal.com.tr` ile kısıtlı.

```bash
bun install
cp .env.example .env   # değerleri doldur
bun run build          # istemci bundle + Tailwind CSS → public/
bun run dev            # geliştirme (hot reload)
bun run start          # üretim (build + serve)
bun test               # tüm testler
```

## 2. Katmanlama (load-bearing — bozma)

| Katman | Sorumluluk | Kural |
|---|---|---|
| `src/domain/` | saf iş mantığı (status FSM, request-no, validation, authz) | **zero I/O** — `bun:sqlite`/`fetch`/nodemailer import YASAK |
| `src/db/` | tüm SQL + migration; `departments`, `modules`, `applications` tabloları; repo CRUD | iş mantığı taşımaz |
| `src/auth/` | session (HMAC) + Google OAuth yardımcıları | — |
| `src/mail/` | best-effort mailer (hata akışı bloklamaz) | — |
| `src/storage/` | dosya sistemi ek I/O (put/read/remove) | `Deps` ile enjekte; domain'e sızma |
| `src/server/` | **Bun.serve HTTP katmanı**: `handler.ts` (saf `(Request)→Response` router + DI `Deps`), `guards.ts` (session/CSRF), `cookies.ts`, `context.ts`, `escape.ts`, `uploads.ts`, `routes/{requests,admin,auth,attachments}.ts` (JSON/binary handler'lar) | ince adapter; iş kuralını domain'e delege et |
| `src/client/` | **istemci React SPA**: `index.html`, `main.tsx`, `app.tsx` (react-router ağacı), `api.ts` (fetch + CSRF header + 401 redirect), `auth.tsx`, `labels.ts`, `layouts/` (`AuthGate` /api/me+context, `EmployeeLayout` üst-header, `AdminLayout` sidebar konsol — admin-gate), `hooks/` (`useRequestDetail`), `pages/*` (ayrı `RequestDetailEmployee` + `RequestDetailAdmin`), `components/*` (yeniden kullanılabilir bileşenler: `FilePicker`, `ConfirmDialog`, `Toast`, `StatusBadge`, `Thread`, `Attachments` vb.) | I/O yok — yalnız `api.ts` server'a fetch eder. **Çalışan alanı** (`/yeni`,`/my`,`/requests/:id`) ile **Yönetim alanı** (`/admin`,`/admin/tanimlar`,`/admin/requests/:id`) ayrı layout+rota namespace'leri. `Tanımlar` sayfası departman, modül **ve uygulama** listelerini yönetir |
| `src/components/ui/` | shadcn primitive'leri (Button/Card/Badge/Dialog) | — |
| `src/index.ts` | `Bun.serve({ routes, fetch: makeHandler(deps) })` + DI wiring | — |

Bağımlılıklar `Deps` ile **dışarıdan enjekte edilir** (config, repo, mailer, storage, `now`)
— `makeHandler(deps)` testte mock geçmeyi sağlar; bunu koru.

## 3. Durum Makinesi (SSoT: `src/domain/status.ts`)

Kod/DB'de İngilizce ascii slug, UI'da Türkçe label:

| slug | label |
|---|---|
| `new` | Yeni |
| `clarifying` | Netleştiriliyor |
| `answered` | Cevaplandı |
| `accepted` | Kabul edildi |
| `rejected` | Reddedildi |

Geçişler: `new→clarifying`, `clarifying↔answered` (kaç tur olursa), her
non-terminal'den `accepted`/`rejected`. **Terminal durumlardan çıkış yok.**
Invariant iki yerde zorlanır: route ön-kontrolü (`canTransition`, 409 döner) **ve**
repo sınırı (`updateStatus`/`addMessageAndTransition` illegal geçişte throw eder).
Mesaj+durum değişimi **atomiktir** (`addMessageAndTransition`, tek transaction).

## 4. Güvenlik Sözleşmesi

- **Auth gate:** `/api/*` route'ları geçerli session ister (`/auth/*` muaf). Yetkisiz
  istek **401 JSON** döner; istemci SPA `api.ts` içinde 401'i yakalayıp
  `/auth/google`'a yönlendirir.
- **Hosted-domain:** OAuth callback'te `verifyDomain` hem `hd` claim'ini hem
  e-posta domainini doğrular (hd spoof'una karşı). Domain dışı giremez.
- **Session:** HMAC-imzalı cookie + kriptografik **expiry** (`iat` + max-age 8s),
  constant-time compare. `httpOnly`.
- **CSRF (double-submit):** non-httpOnly `csrf` cookie (login'de + kimlik doğrulanmış
  isteklerde basılır) ↔ mutating isteklerde `X-CSRF-Token` header; constant-time
  compare. Tek muafiyet: `/logout` (yalnız session siler).
- **Yetki / IDOR:** talep eden yalnız kendi talebini görür/cevaplar
  (`canViewRequest`/`canReply`); admin route'ları `isAdmin` ister. Bulunamayan/
  yetkisiz kaynak **404** (varlık sızdırma yok).
- **Ek dosyalar:** `nosniff` + CSP sandbox ile servis edilir (allowlist dışı tipler
  zorla indirme).
- **Çıktı kaçışı:** istemci React tarafında otomatik; mail gövdelerinde user-text
  (başlık, ret gerekçesi) `esc()` ile kaçırılır.
- **Sırlar** `.env`'de, **commit edilmez** (`.gitignore`). Hardcoded credential yok.

Yeni route eklerken: auth gate'in kapsadığını, mutating ise CSRF header doğrulaması
+ yetki + id-param NaN guard'ın olduğunu doğrula.

## 5. i18n / İsimlendirme

- **Kod, dosya adı, değişken, DB alanı, commit mesajı İngilizce.**
- **UI metinleri Türkçe** (`src/client/**`, `labels.ts`, mail konuları, hata metinleri).
- Türkçe karakter dosya/klasör adında kullanma.

## 6. Test

- **TDD:** önce başarısız test → minimal kod → yeşil → commit.
- Saf domain mantığı **exhaustive** birim test; route/handler entegrasyon testleri
  `src/server/**/*.test.ts` içinde in-memory SQLite + mock auth/mail ile `makeHandler`'a
  karşı koşar. OAuth/SMTP testte mock'lanır.
- Testler kaynak yanında co-located (`*.test.ts`).
- **Gate:** `bun test` yeşil olmadan commit yok.

## 7. Commit & Versiyon

- **Conventional Commits** zorunlu (`feat`/`fix`/`docs`/`chore`/`test`/`refactor`).
- Davranış değiştiren her değişiklik testle gelir.
- (Henüz release tooling yok; ihtiyaç doğunca eklenir.)

## 8. Kapsam — Şu An Dışı (Sonraki Faz "D")

- "kabul_edildi" → GitHub issue otomatik dönüştürme.
- Yönetici dashboard'u (modül/öncelik/durum kırılımı, açık-talep yaşı).
- AI ile otomatik soru üretimi.

Bu alanlara dokunmadan önce `docs/superpowers/specs/` altında tasarımı netleştir.
