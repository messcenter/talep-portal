# Talep Portalı

Çalışanlardan **ERP / yazılım taleplerini** toplayan, her talebi elle yazılan
**netleştirme sorularıyla** bir soru-cevap iş parçacığı üzerinden olgunlaştıran ve
**kabul / ret** kararına bağlayan bağımsız bir iç araçtır. Önceki "Google Form →
Sheet → elle kopyala" akışının yerini alır.

> Bağımsız bir iç araçtır; bir mess-erp modülü değildir. Sorular **otomatik
> üretilmez** — yönetici elle yazar (AI/LLM entegrasyonu yoktur).

---

## Öne çıkanlar

- **Talep akışı** — çalışan; departman, uygulama, modül/alan, tür, öncelik, başlık,
  açıklama ve beklenen faydayı içeren bir form ile talep oluşturur, dosya ekleyebilir.
- **Netleştirme** — yönetici ile çalışan arasında, talebi olgunlaştıran bir
  soru-cevap iş parçacığı (kaç tur olursa).
- **Karar** — her talep gerekçeli biçimde **kabul** veya **ret** ile sonuçlanır.
- **Yönetici Özet paneli** — durum/öncelik kırılımı ve **7+ gün hareketsiz**
  taleplerin triyaj listesi (bir bakışta sağlık + bekleyen iş).
- **Tanımlar** — departman ve modül yönetimi (admin).
- **Markdown dışa aktarım** — bir talebin tüm geçmişini `.md` olarak indir.
- **E-posta bildirimleri** — talep, soru, kabul/ret olaylarında (Zoho SMTP,
  en-iyi-çaba; hata akışı bloklamaz).
- **Google Workspace girişi** — `hd=kokilmetal.com.tr` ile alan-kısıtlı; yalnızca
  kurumsal hesaplar girer.

## Teknoloji

| Katman | Seçim |
|---|---|
| Sunucu | **Bun** + `Bun.serve` (framework yok), JSON API |
| Veritabanı | **SQLite** (`bun:sqlite`), tek `data.db` dosyası |
| İstemci | **React 19** SPA + react-router, `bun build` ile bundle |
| Arayüz | **Tailwind CSS** + shadcn/ui primitive'leri; zengin metin için **TipTap** |
| Posta | **nodemailer** (Zoho SMTP) |
| Doğrulama | **Zod** |
| Kimlik | Google OAuth 2.0 (hosted-domain doğrulamalı), HMAC-imzalı session |

İstemci stilleri **yerel olarak** `public/app.css`'e derlenir (CDN bağımlılığı yok)
— internetsiz/air-gapped ağda da çalışır.

---

## Hızlı başlangıç

Önkoşul: **Bun ≥ 1.3**.

```bash
bun install
cp .env.example .env        # değerleri doldur (aşağıdaki tablo)
bun run dev                 # geliştirme (hot reload, http://localhost:3000)
```

Üretim için:

```bash
bun run start               # build + serve
```

### Docker ile çalıştırma

```bash
cp .env.example .env        # değerleri doldur
docker compose up -d --build
```

Tek servis ayağa kalkar; kalıcı durum (`data.db` + `uploads/`) `talep-data` adlı
volume'da tutulur (konteyner silinse de kalır). Host portu `.env`'deki `PORT`
değerinden gelir. Yedek = bu volume'u kopyala.

### Google OAuth kurulumu

Google Cloud Console → **OAuth 2.0 Client ID** oluştur ve yetkili yönlendirme
URI'sini ekle:

```
${APP_BASE_URL}/auth/google/callback
```

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` değerlerini `.env`'e yaz. Giriş yalnızca
`GOOGLE_HOSTED_DOMAIN` ile eşleşen hesaplara açıktır.

### Tanımları tohumlama (opsiyonel)

Başlangıç departman/modül listesini eklemek için:

```bash
bun run seed:definitions            # ./data.db
DB_PATH=dev.db bun run seed:definitions
```

Yeniden çalıştırmak güvenlidir (var olan kayıtlar atlanır). Silme işlemleri yönetici
**Tanımlar** sayfasından yapılır.

---

## Ortam değişkenleri (`.env`)

| Değişken | Açıklama |
|---|---|
| `PORT` | Sunucu portu (ör. `3000`) |
| `APP_BASE_URL` | Dış URL; OAuth callback ve mail bağlantılarında kullanılır |
| `SESSION_SECRET` | Session HMAC anahtarı (**en az 32 bayt**, gizli tut) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth istemci kimlik bilgileri |
| `GOOGLE_HOSTED_DOMAIN` | İzinli alan (`kokilmetal.com.tr`) |
| `ADMIN_EMAILS` | Yönetici e-postaları (virgülle ayrılır) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | Zoho SMTP (`smtp.zoho.com` / `465` / `true`) |
| `SMTP_USER` / `SMTP_PASS` | SMTP kimlik bilgileri |
| `MAIL_FROM` | Gönderen başlığı |
| `DB_PATH` | SQLite dosya yolu (varsayılan `data.db`) |
| `UPLOAD_DIR` | Ek dosya klasörü (varsayılan `uploads`) |

> **Sırlar commit edilmez.** `.env`, `.gitignore` ile dışlanmıştır.

---

## Komutlar

| Komut | İş |
|---|---|
| `bun run dev` | Geliştirme: Tailwind + istemci bundle izleme + `--hot` sunucu |
| `bun run start` | Üretim: derle ve servis et |
| `bun run build` | İstemci bundle + CSS + HTML → `public/` |
| `bun test` | Tüm testler |
| `bun run seed:definitions` | Departman/modül tohumlama |

---

## Mimari

Katmanlar yük taşır; sınırları koru (ayrıntı: [`CLAUDE.md`](./CLAUDE.md)).

```
src/
  domain/    saf iş mantığı — durum FSM, doğrulama, yetki, talep no, özet hesaplama
             (ZERO I/O: bun:sqlite / fetch / nodemailer import YASAK)
  db/        tüm SQL + şema/migration (iş mantığı taşımaz)
  auth/      session (HMAC) + Google OAuth
  mail/      en-iyi-çaba mailer (hata akışı bloklamaz)
  storage/   dosya sistemi ek I/O (Deps ile enjekte)
  server/    Bun.serve HTTP katmanı — saf (Request)→Response router + guard'lar
             (session/CSRF), routes/{requests,admin,auth,attachments}
  client/    React SPA — yalnızca api.ts server'a fetch eder
             Çalışan alanı (/yeni, /my, /requests/:id) ve
             Yönetim alanı (/admin, /admin/talepler, /admin/tanimlar) ayrı layout'lar
  index.ts   Bun.serve + bağımlılık (Deps) wiring
```

Bağımlılıklar (config, repo, mailer, storage, saat) **dışarıdan enjekte edilir**
(`makeHandler(deps)`) — bu, testte mock geçmeyi sağlar.

### Durum makinesi

Kod/DB'de İngilizce slug, arayüzde Türkçe etiket:

| slug | Etiket | |
|---|---|---|
| `new` | Yeni | başlangıç |
| `clarifying` | Netleştiriliyor | yönetici soru sordu |
| `answered` | Cevaplandı | çalışan yanıtladı |
| `accepted` | Kabul edildi | **terminal** |
| `rejected` | Reddedildi | **terminal** |

Geçişler: `new → clarifying`, `clarifying ↔ answered` (kaç tur olursa), her
terminal-olmayan durumdan `accepted` / `rejected`. Terminal durumlardan çıkış yoktur.
Kural hem route ön-kontrolünde hem repo sınırında zorlanır; mesaj + durum değişimi
tek transaction'da atomiktir.

---

## Güvenlik

- **Auth gate** — tüm `/api/*` geçerli session ister; yetkisiz istek **401 JSON**,
  istemci `/login` karşılama sayfasına yönlendirir.
- **Hosted-domain** — OAuth callback hem `hd` claim'ini hem e-posta domainini
  doğrular (hd spoof'una karşı).
- **Session** — HMAC-imzalı, kriptografik expiry'li (kısa ömürlü, ≈8 saat),
  `httpOnly` cookie; sabit-zamanlı karşılaştırma.
- **CSRF** — double-submit: `csrf` cookie ↔ mutasyon isteklerinde `X-CSRF-Token`,
  sabit-zamanlı karşılaştırma.
- **Yetki / IDOR** — talep eden yalnız kendi talebini görür/cevaplar; admin route'ları
  `isAdmin` ister; bulunamayan/yetkisiz kaynak **404** (varlık sızdırma yok).
- **Ekler** — `nosniff` + CSP sandbox ile servis edilir.
- **Statik varlıklar** — hash'li JS chunk'lar `immutable`, `main.js`/HTML/CSS
  `no-cache` (bir build asla eski bundle'a kilitlemez).

---

## Veri ve yedekleme

Tüm kalıcı durum iki yerdedir:

- `data.db` — SQLite veritabanı
- `uploads/` — ek dosyalar

**Yedek = bu ikisini birlikte kopyala.** (SQLite WAL modunda çalışır.)

---

## Test

TDD esastır: önce başarısız test → minimal kod → yeşil → commit. Saf domain mantığı
exhaustive birim testlidir; route/handler testleri in-memory SQLite + mock auth/mail
ile `makeHandler`'a karşı koşar. Testler kaynakla co-located (`*.test.ts`).

```bash
bun test
```

---

## Geliştirme sözleşmesi

Çalışma kuralları (katmanlama, i18n, commit, test gate) [`CLAUDE.md`](./CLAUDE.md)
içindedir; tasarım/plan kayıtları `docs/superpowers/` altındadır. Özetle: kod/dosya/
commit **İngilizce**, arayüz metinleri **Türkçe**; Conventional Commits zorunlu;
`bun test` yeşil olmadan commit yok.
