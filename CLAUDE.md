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

- **Bun + Hono + SQLite (`bun:sqlite`)**, sunucu-tarafı render HTML (Tailwind CDN),
  nodemailer (Zoho SMTP), Zod. Frontend build adımı yok.
- Tek process, tek `data.db` dosyası + `uploads/` ek klasörü. **Yedek = `data.db`
  dosyasını ve `uploads/` klasörünü birlikte kopyala.**
- Giriş: Google Workspace OAuth, `hd=kokilmetal.com.tr` ile kısıtlı.

```bash
bun install
cp .env.example .env   # değerleri doldur
bun run dev            # geliştirme (--watch)
bun run start          # üretim
bun test               # tüm testler
```

## 2. Katmanlama (load-bearing — bozma)

| Katman | Sorumluluk | Kural |
|---|---|---|
| `src/domain/` | saf iş mantığı (status FSM, request-no, validation, authz) | **zero I/O** — `bun:sqlite`/`fetch`/nodemailer import YASAK |
| `src/db/` | tüm SQL + migration | iş mantığı taşımaz |
| `src/auth/` | session (HMAC) + Google OAuth yardımcıları | — |
| `src/mail/` | best-effort mailer (hata akışı bloklamaz) | — |
| `src/storage/` | dosya sistemi ek I/O (put/read/remove) | `Deps` ile enjekte; domain'e sızma |
| `src/views/` | saf string HTML render | I/O yok |
| `src/routes/` | ince adapter: doğrula → domain'e dispatch → repo/mail | iş kuralı gömme; domain'e delege et |
| `src/app.ts` | Hono fabrikası + auth/CSRF middleware + DI (`Deps`) | — |

Bağımlılıklar `Deps` ile **dışarıdan enjekte edilir** (config, repo, mailer, storage, `now`)
— bu testte mock geçmeyi sağlar; bunu koru.

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

- **Auth gate:** `/auth/*` dışındaki tüm route'lar geçerli session ister
  (`app.ts` middleware). GET → login sayfası (401), mutating → 401 text.
- **Hosted-domain:** OAuth callback'te `verifyDomain` hem `hd` claim'ini hem
  e-posta domainini doğrular (hd spoof'una karşı). Domain dışı giremez.
- **Session:** HMAC-imzalı cookie + kriptografik **expiry** (`iat` + max-age 8s),
  constant-time compare. `httpOnly`.
- **CSRF:** cookie tabanlı; tüm POST'larda `_csrf` token (`httpOnly` cookie ↔
  server-render hidden field). Tek muafiyet: `/logout` (yalnız session siler).
- **Yetki / IDOR:** talep eden yalnız kendi talebini görür/cevaplar
  (`canViewRequest`/`canReply`); admin route'ları `isAdmin` ister. Bulunamayan/
  yetkisiz kaynak **404** (varlık sızdırma yok).
- **Çıktı kaçışı:** tüm dinamik veri HTML'de `esc()` ile kaçırılır; mail
  gövdelerinde de user-text (başlık, ret gerekçesi) kaçırılır.
- **Sırlar** `.env`'de, **commit edilmez** (`.gitignore`). Hardcoded credential yok.

Yeni route eklerken: auth gate'in kapsadığını, mutating ise CSRF + yetki +
id-param NaN guard'ın olduğunu doğrula.

## 5. i18n / İsimlendirme

- **Kod, dosya adı, değişken, DB alanı, commit mesajı İngilizce.**
- **UI metinleri Türkçe** (`views.ts`, mail konuları, hata metinleri).
- Türkçe karakter dosya/klasör adında kullanma.

## 6. Test

- **TDD:** önce başarısız test → minimal kod → yeşil → commit.
- Saf domain mantığı **exhaustive** birim test; route'lar in-memory SQLite +
  mock auth/mail ile entegrasyon testi. OAuth/SMTP testte mock'lanır.
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
