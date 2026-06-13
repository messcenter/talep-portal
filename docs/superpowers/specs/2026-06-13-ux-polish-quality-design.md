# UX Cila & Kalite Paketi — Tasarım

- **Tarih:** 2026-06-13
- **Durum:** Onaylandı (brainstorm)
- **Bağlam:** Bun.serve + React SPA portalı. MVP + React/shadcn + ekler + departman/modül
  yönetimi + ayrı admin alanı tamam (192 test yeşil). Bu paket, çalışan uygulamanın
  Playwright denetiminde çıkan **cila/kalite** açıklarını kapatır. Yeni yetenek değil;
  var olanı tutarlı, güvenli ve erişilebilir hale getirmek.

## 1. Problem (denetim bulguları)

Çalışan uygulama gezildiğinde dört açık görüldü:

1. **Dosya ekleme native/İngilizce:** Yeni Talep formundaki `<input type=file>` ham
   tarayıcı kontrolü ("CHOOSE FILES / No file chosen"), Türkçe shadcn arayüzüyle
   çelişiyor; seçilen dosya adları/sayısı görünmüyor.
2. **"Uygulama" tutarsız:** Departman ve Talep Türü yönetilen dropdown iken Uygulama
   sabit "ERP" ön-değerli serbest metin. Kartlarda hep "ERP" görünüyor; yazım
   farklarıyla kirli veri riski.
3. **Yıkıcı silmede onay yok:** Tanımlar'da departman/modül silme tek tıkla oluyor
   (shadcn `Dialog` projede var ama kullanılmıyor). Modül ✕'i görsel olarak zayıf.
4. **Geri bildirim/erişilebilirlik açıkları:** Başarı geri bildirimi (toast) yok;
   admin sidebar'ın dar ekran davranışı denetlenmemiş.

## 2. Karar (brainstorm)

Dördü de tek bir cila paketinde, mevcut katmanlamayı (CLAUDE.md §2) koruyarak ele
alınır. "Uygulama" alanı **departmanlar gibi yönetilen düz bir listeye** dönüşür
(kullanıcı kararı). Domain saf kalır; yeni `applications` varlığı `departments`
desenini birebir aynalar. Her parça TDD ile, bağımsız commit/merge edilebilir sırada.

## 3. Mimari

### 3.1 `FilePicker` bileşeni (tekrar kullanılabilir) — `src/client/components/FilePicker.tsx`
Kontrollü bir bileşen: gizli native `<input type=file multiple accept=...>` + Türkçe
"Dosya seç" tetik butonu + seçilen dosya listesi (ad · okunur boyut · ✕ kaldır) +
boş durumda "Dosya seçilmedi" + boyut/format ipucu.

- Kendi `File[]` state'ini tutar. Native FileList programatik set edilemediği için
  bileşen dosyaları **sahiplenir** ve dışarıya verir:
  `<FilePicker value={files} onChange={setFiles} accept=... />` — kontrollü.
- Form submit'inde parent, `files`'ı FormData'ya `files` anahtarıyla **append** eder
  (mevcut native input'a güvenmek yerine). Backend `collectFiles`/`processUploads`
  zaten `files` anahtarını birden çok değerle okuyor → backend değişmez.
- Kullanım: **Yeni Talep** (`NewRequest`) **ve Cevap** formu (`ReplyForm`) — ikisi de
  backend'de ek dosya destekliyor (`requests.ts` create + reply).
- a11y: tetik gerçek `<button>`; her kaldır butonunda `aria-label="<ad> kaldır"`;
  liste `<ul>`; gizli input görsel gizli ama label'lı.

### 3.2 "Uygulama" yönetilen liste (tam yığın)

**DB (`src/db/db.ts`)** — additive migration, `IF NOT EXISTS`:
```sql
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
```
`requests.application` denormalize string olarak **kalır** (departmanla aynı; geçmiş
talepler silmeden etkilenmez). Seed yok — admin UI'dan ekler.

**Repo (`src/db/repo.ts`)** — departman metotlarını aynala:
`listApplications(): Application[]`, `createApplication(name, now)`,
`getApplication(id)`, `deleteApplication(id)`.

**Route (`src/server/routes/definitions.ts`)** — mevcut desen:
- `GET /api/applications` → her kimliği doğrulanmış kullanıcı (formu beslemek için).
- `POST /api/admin/applications` (admin) → `{name}`; boş→400, UNIQUE→409, başarı→201 `{id}`.
- `DELETE /api/admin/applications/:id` (admin) → yoksa 404, başarı→204.
`readName`/`isUniqueErr` yardımcıları yeniden kullanılır.

**Form (`src/client/pages/NewRequest.tsx`):**
- Serbest metin "Uygulama" → `/api/applications`'tan beslenen `<select>` (kontrollü).
- "ERP" ön-değeri kalkar; `Seçiniz…` ilk seçenek; `required`.
- `/api/departments` ile birlikte `/api/applications` yüklenir. Uygulama listesi boşsa,
  departman-boş durumundaki gibi bilgilendir ("Henüz uygulama tanımlanmamış…").

**Validation (`src/domain/validation.ts`):** `application` şemada `nonBlank(120)`
**kalır** (departmanla tutarlı). Sunucu-tarafı üyelik kontrolü eklenmez — form dropdown
ile kısıtlar; departmanın mevcut davranışıyla birebir. (Sıkı doğrulama istenirse route
katmanında ileride; bu pakette **kapsam dışı**.)

### 3.3 Tanımlar: onay dialogu + Uygulamalar bölümü — `src/client/pages/Definitions.tsx`
- **Onay dialogu (shadcn `Dialog`):** departman, modül ve uygulama silmeden önce
  *"«{ad}» silinsin mi? Geçmiş talepler bu işlemden etkilenmez."* + İptal / Sil.
  Tek bir `ConfirmDialog` sarmalı (başlık + mesaj + onConfirm) ile üç yerde kullanılır.
- **Uygulamalar kartı:** sayfaya "Uygulamalar" bölümü — düz liste (ekle input + çipler,
  her çipte ✕). Modülsüz departman deseni; `/api/admin/applications` uçlarını kullanır.
- **Başlık güncellenir:** "Tanımlar — Departman, Modül & Uygulama".
- Modül/uygulama ✕ tıklama alanı biraz büyütülür (hit-area + kontrast).

### 3.4 Geri bildirim & erişilebilirlik
- **Toast:** hafif `src/client/components/Toast.tsx` + `useToast` (basit context,
  ~3sn auto-dismiss, `role="status"`). Tetiklenir: talep oluşturuldu, cevap gönderildi,
  karar verildi (kabul/ret), tanım eklendi/silindi. Hata akışı mevcut `role="alert"`
  kutularıyla kalır; toast başarı içindir.
- **Mobil:** `AdminLayout` sidebar'ı dar ekranda denetlenir → daraltılabilir/üste
  yığılan davranışa çevrilir (drawer şart değil; `< md` altında sidebar üstte yatay
  nav'a düşebilir). `EmployeeLayout` header zaten yatay; mobilde sığması doğrulanır.
- **a11y:** Dialog focus-trap'ı shadcn sağlar; aç/kapa klavye ile; kaldır butonları
  `aria-label`'lı ve klavyeyle erişilebilir; select/label eşleşmeleri (mevcut `FieldLabel`).

## 4. Davranış matrisi (yeni/değişen)
| Durum | Beklenen |
|---|---|
| Form: uygulama listesi boş | "Henüz uygulama tanımlanmamış" notu; gönderim engellenir |
| Form: dosya seçildi | FilePicker'da ad+boyut listesi + ✕; gönderimde `files` append |
| Tanımlar: departman/modül/uygulama sil | Onay dialogu; onaylanırsa silinir + toast |
| Tanımlar: var olan uygulama eklenir | 409 → hata kutusu "Bu uygulama zaten var" |
| Talep oluşturuldu / cevap / karar | Başarı toast'ı |
| Dar ekran (admin) | Sidebar yatay/üste yığılır; içerik tam genişlik |
| `GET /api/applications` (oturumsuz) | 401 (auth gate) |
| `POST/DELETE /api/admin/applications` (admin değil) | 403 |

## 5. Test
- **Backend (TDD, `bun test`, in-memory SQLite + mock auth/mail):**
  - repo: applications CRUD + UNIQUE çakışması.
  - route: `GET /api/applications` (oturum şart), admin POST/DELETE (403 gate, 400 boş,
    409 dup, 404 yok, 201/204 başarı) — `definitions.test.ts` desenini aynala.
  - Mevcut 192 test yeşil kalmalı; migration additive olduğundan repo testleri etkilenmez.
- **Frontend:** `bun run build` gate; `FilePicker` saf mantığı (dosya ekle/kaldır,
  boyut biçimleme) için birim test (`StatusBadge.test.tsx` deseni). Toast için temel test.
- **Elle/Playwright tur (sonda):** yeni talep (uygulama dropdown + FilePicker), tanımlar
  (uygulama ekle/sil + onay dialogu), toast görünürlüğü, dar ekran sidebar.

## 6. Kapsam Dışı (YAGNI)
- Sunucu-tarafı uygulama/departman **üyelik doğrulaması** (form dropdown yeterli).
- Sürükle-bırak dosya yükleme (FilePicker'da opsiyonel; bu pakette zorunlu değil).
- Toast kütüphanesi/animasyon motoru (kendi minimal bileşenimiz).
- Uygulama→modül ilişkisi (uygulama düz liste; modül departmana bağlı kalır).
- Departman/uygulama silmede geçmiş talepleri yeniden bağlama/temizleme (string kalır).

## 7. Riskler & Notlar
- **FilePicker kontrol modeli:** native FileList set edilemez → bileşen `File[]`'i
  sahiplenip submit'te FormData'ya append eder. Mevcut formun "native input FormData'ya
  düşer" varsayımı değişir; her iki form da güncellenmeli, yoksa dosyalar gitmez.
- **CLAUDE.md §2** güncellenir: `applications` tablosu + `FilePicker`/`Toast`/`ConfirmDialog`
  bileşenleri + Tanımlar'ın uygulama yönetimi.
- **`module_area`/`application` kart gösterimi:** boş uygulama/modül kartta nokta-ayraç
  kirliliği yapmamalı (mevcut `RequestMeta`/`RequestCard` boş alanları zaten atlıyorsa
  korunur; değilse atlanır).
- **Definitions.tsx büyümesi:** departman + modül + uygulama + dialog tek dosyada
  şişebilir → `ConfirmDialog` ve uygulama bölümü ayrı bileşenlere çıkarılır.
