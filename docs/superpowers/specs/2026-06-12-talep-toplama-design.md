# Talep Toplama & Netleştirme Portalı — Tasarım

- **Tarih:** 2026-06-12
- **Durum:** Onaylandı (tasarım)
- **Sahip:** Görkem
- **Tip:** İç araç (mess-erp modülü değil; ayrı proje)

## 1. Amaç

Çalışanlardan ERP/yazılım talebi toplamak ve her talebi, üzerinde elle yazılan
netleştirme soruları aracılığıyla "kabul" veya "ret" kararına kadar
olgunlaştırmak.

Bugünkü akış (Google Form → Google Sheet → satırların elle kopyalanması →
soruların elle üretilmesi) yerine, tek bir portalda toplama + çok turlu soru-cevap
döngüsü + karar yürütülür.

### Kapsam dışı (şimdilik)
- Yapay zekâ ile otomatik soru üretimi — sorular elle yazılır.
- GitHub issue'a otomatik dönüştürme — sonraki faz (D).
- Yönetici dashboard'u / analitik — sonraki faz (D).
- Görsel/dosya ekleri — sonraki tur (gerekirse eklenir).

## 2. Roller

- **Talep eden:** `@kokilmetal.com.tr` çalışanı. Talep gönderir, kendi
  taleplerini görür, sorulara cevap verir.
- **Admin:** env'de tanımlı e-posta listesindeki kişiler (örn. Görkem). Tüm
  talepleri görür, soru ekler, kabul/ret kararı verir.

Rol, Google kimliğinden türetilir — ayrı şifre yoktur.

## 3. Mimari

Tek bir Bun process. İki yüz:

- **Public yüz** (giriş gerekli, login Google ile) — çalışan formu + kendi
  talepleri + cevap.
- **Admin yüz** (allowlist) — talep listesi, soru ekleme, durum/karar.

```
[Çalışan] --form/cevap--> Bun + Hono ──> SQLite (data.db)
[Admin]   --yönetim-----> │      │
                          │      └─> nodemailer ──> SMTP (Workspace relay)
                          └─> Google OAuth (hd=kokilmetal.com.tr)
```

- **Veri:** tek dosya SQLite (`data.db`).
- **Yedek:** `data.db` (+ ileride `uploads/`) dosyasını kopyala.
- **Stack:** Bun + Hono (router) + SQLite + sunucu-tarafı render edilen HTML
  (Tailwind CDN) + nodemailer. Frontend build adımı yok.
- **Dil:** UI metinleri Türkçe; kod/dosya/değişken/DB alan adları İngilizce.

## 4. Veri modeli

İki tablo.

### `requests`
| Alan | Açıklama |
|---|---|
| `id` | PK |
| `request_no` | Otomatik `TALEP-0001` (sıralı) |
| `created_at` | Oluşturma zamanı |
| `requester_name` | Google profilinden |
| `requester_email` | Google profilinden (kimlik anahtarı) |
| `department` | Talep eden birim |
| `application` | Hangi uygulama (ERP, …) |
| `module_area` | Modül/alan (opsiyonel) |
| `request_type` | Yeni Özellik / Hata / Görev |
| `title` | Kısa başlık |
| `description` | Detay |
| `expected_benefit` | Beklenen fayda |
| `priority` | Düşük / Orta / Yüksek |
| `status` | Bkz. §5 |

> `token` alanı yoktur — talep eden, Google kimliğiyle kendi taleplerini görür.

### `messages` (netleştirme döngüsü)
| Alan | Açıklama |
|---|---|
| `id` | PK |
| `request_id` | FK → requests |
| `author_role` | `admin` \| `requester` |
| `body` | Soru veya cevap metni |
| `created_at` | Zaman |

Çok turlu soru-cevap aynı iş parçacığında akar. Ret gerekçesi de bir `admin`
mesajı olarak akışa düşer (şeffaflık).

## 5. Durum akışı (`requests.status`)

```
yeni
  └─(admin soru sorar)──> netleştiriliyor ⇄ cevaplandı   (kaç tur olursa)
         her aşamadan admin karar verebilir:
              ├──> kabul_edildi   (terminal; D fazında issue'a döner)
              └──> reddedildi     (terminal; ZORUNLU gerekçe)
```

Geçiş kuralları (saf mantıkta, test edilir):
- `yeni → netleştiriliyor` (admin ilk soruyu sorunca)
- `netleştiriliyor → cevaplandı` (talep eden cevaplayınca)
- `cevaplandı → netleştiriliyor` (admin yeni soru sorunca)
- herhangi non-terminal → `kabul_edildi` (admin)
- herhangi non-terminal → `reddedildi` (admin, gerekçe zorunlu)
- terminal durumlardan (`kabul_edildi`, `reddedildi`) **çıkış yoktur**.

## 6. Sayfalar / route'lar

### Public (giriş gerekli)
- `GET /` → talep giriş formu. İsim/e-posta Google'dan otomatik dolar.
- `POST /requests` → kaydet → "Talebiniz alındı: TALEP-XXXX" + taleplerim linki.
- `GET /my` → talep edenin kendi talepleri listesi.
- `GET /requests/:id` → talep detayı + soru/cevap akışı + (sahibiyse) cevap kutusu.
- `POST /requests/:id/reply` → cevabı ekle (sadece talep sahibi).

### Admin (allowlist arkasında)
- `GET /admin` → tüm talepler; filtre: durum / modül / öncelik.
- `GET /admin/requests/:id` → detay: akış + "soru ekle" + karar (kabul/ret).
- `POST /admin/requests/:id/message` → soru ekle (durum → netleştiriliyor).
- `POST /admin/requests/:id/decision` → `kabul_edildi` veya `reddedildi`
  (ret ise gerekçe zorunlu).

### Auth
- `GET /auth/google` → OAuth başlat (`hd=kokilmetal.com.tr`).
- `GET /auth/google/callback` → doğrula, oturum aç.
- `POST /logout`.

## 7. E-posta bildirimleri

nodemailer + Google Workspace SMTP relay (veya uygulama-şifresi).

| Olay | Kime | İçerik |
|---|---|---|
| Yeni talep | Admin(ler) + talep edene onay | "Talebiniz alındı: TALEP-XXXX" |
| Admin soru ekledi | Talep eden | "Sorular var → giriş yapıp cevaplayın" + link |
| Talep eden cevapladı | Admin(ler) | "TALEP-XXXX cevaplandı" + link |
| Kabul / Ret | Talep eden | Sonuç (+ ret ise gerekçe) |

Mail "best-effort": gönderim başarısız olsa da kayıt/durum commit olur; hata
log'lanır, akışı bloklamaz.

## 8. Güvenlik

- **Google OAuth**, `hd=kokilmetal.com.tr` zorunlu; sunucu tarafında token'daki
  `hd`/`email` domaini ayrıca doğrulanır (parametre spoof'una karşı).
- **Oturum:** imzalı, `httpOnly`, `sameSite` cookie.
- **Yetki:** talep eden yalnız kendi taleplerini görür/cevaplar; admin hepsini.
  Her route'ta sahiplik/rol kontrolü.
- **Admin allowlist:** env'de e-posta listesi (kod/DB'de sabit değil).
- **CSRF:** cookie tabanlı oturum → POST'larda CSRF token.
- **Girdi doğrulama:** tüm formlarda Zod şeması.
- **Sırlar** `.env`'de, commit edilmez: Google client id/secret, session secret,
  SMTP bilgisi, admin listesi.
- İç ağ + önünde reverse proxy ile **HTTPS** (iç CA / self-signed) önerilir.

## 9. Test (Bun test runner)

- **Saf mantık (exhaustive):**
  - durum geçiş kuralları (legal/illegal geçişler; terminalden çıkış yok)
  - `request_no` üretimi (sıralı, çakışmasız)
  - Zod şemaları (zorunlu alanlar, enum'lar)
  - yetki kararı (`bu kullanıcı bu talebi görebilir/değiştirebilir mi`)
- **Entegrasyon:** route handler'lar in-memory SQLite + mock auth/mail ile
  (form gönder → kayıt → durum doğru → mail çağrısı yapıldı).
- **OAuth ve SMTP testte mock'lanır.**

## 10. Kod yerleşimi

- Saf mantık (durum makinesi, yetki, validation, `request_no`) zero-I/O
  modüllerde.
- Route handler'lar ince adapter: I/O orchestrate eder, saf mantığa dispatch eder.
- Testler kaynak yanında co-located.

## 11. Çevre değişkenleri (`.env`)

```
PORT=
SESSION_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_HOSTED_DOMAIN=kokilmetal.com.tr
ADMIN_EMAILS=g.kalipcilar@...,...
SMTP_HOST=smtp-relay.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
APP_BASE_URL=
```

## 12. Sonraki fazlar (D)

- "kabul_edildi" → GitHub issue otomatik (CLAUDE.md §8 standardı: repo + label +
  `kapsam: özet` başlık + DoD).
- Yönetici dashboard'u: modül/öncelik/durum kırılımı, açık-talep yaşı, vb.
- Görsel/dosya ekleri.
