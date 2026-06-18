# İlgili Departmanlar (Çoklu Etiket) — Tasarım

**Tarih:** 2026-06-18
**Durum:** Onaylandı (uygulama bekliyor)

## Problem

Bir talep tek bir `department` (ana/kaynak departman) ile oluşturuluyor. Ama gerçek
hayatta bir ERP talebi sıkça **birden fazla departmanı** keser — örn. "mobil barkod
okuma" hem Üretim (kullanıcı) hem Lojistik hem IT'yi ilgilendirir. Şu an bu kesişimi
ifade etmenin yolu yok; admin tek bir departman filtresi uygulayınca kesişen talepleri
kaçırır.

## Çözüm Özeti

Mevcut `requests.department` (ana, tek, metin) **aynen korunur**. Yanına opsiyonel
**"ilgili departmanlar"** (çoklu etiket) eklenir. Bir talep oluşturulurken/admin
düzenlerken ilgili departmanlar eklenebilir; admin "Tüm Talepler" listesinde bir
departman filtresi uyguladığında, talebin **ana veya ilgili** departmanlarından biri
eşleşirse listelenir.

Kapsam (kullanıcı kararı): form + DB + detail'de chip gösterimi + **admin department filtresi**.
Kapsam dışı: dashboard `byDepartment` kırılımı, mail şablonlarında ilgili dept gösterimi.

## Kararlar (load-bearing)

1. **Name-based saklama (mevcut desenle uyum):** `requests.department` zaten TEXT (departman adı) olarak saklanıyor ve departments tablosu ayrı bir "managed liste". Aynı desende gitmek için `request_departments` tablosu da **department adını** saklar (FK değil). Bu, bir departman Tanımlar'dan silinse bile tarihsel talep kaydının korunmasını sağlar (mevcut `requests.department` davranışıyla tutarlı). FK + cascade karmaşası yok.
2. **Ana departman tekrarı yok:** ilgili departmanlar listesinde ana departman (`requests.department`) **bulunamaz** — validation 400 döner. UI'da ana departman zaten seçili olduğu için ilgili listeden otomatik hariç tutulur.
3. **Managed dept doğrulaması:** her ilgili departman `departments` tablosunda gerçek bir kayıt olmalı (`getDepartmentByName`); yoksa 400. Bu, mevcut ana-departman doğrulamasıyla paralel.
4. **Sınır:** en fazla **10** ilgili departman (makul üst sınır; kötüye kullanım/UIS karmaşıklığı).
5. **Sıralama:** `listRelatedDepartments` → `ORDER BY name ASC` (deterministik, locale-bağımsız).
6. **Departman silme:** Tanımlar'dan bir departman silindiğinde, `request_departments`'te kalan adlar "hayalet" etiket olarak kalır (`requests.department`'daki gibi). Bu kabul edilir; temizlik kapsam dışı. (Talep silme yok → request_departments için ON DELETE gerekmez.)
7. **Filtre semantiği:** admin `?department=X` → `requests.department = X OR EXISTS(request_departments WHERE department = X)`. status/priority filtreleriyle AND'lenir (mevcut davranış).
8. **Module/application:** dokunulmaz. İlgili departmanlar yalnız departman seviyesindedir; ilgili departman başına module seçimi **yok** (karmaşıklık YAGNI).

## Veri Modeli

`src/db/db.ts` migration'a yeni tablo (mevcut `CREATE TABLE IF NOT EXISTS` akışına):

```sql
CREATE TABLE IF NOT EXISTS request_departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(request_id, department)
);
CREATE INDEX IF NOT EXISTS idx_request_departments_request ON request_departments(request_id);
CREATE INDEX IF NOT EXISTS idx_request_departments_dept ON request_departments(department);
```

- `department`: departman adı (lowercase normalize edilmez; `requests.department` ve `departments.name` ile aynı ham değer — karşılaştırmalar zaten ham ad üzerinden).
- `ON DELETE CASCADE`: talep silinirse (ileride) ilişkiler de gider; şu an talep silme yok ama tutarlılık için.

## Domain (`src/domain/validation.ts`)

`newRequestSchema`'ya opsiyonel alan eklenir:

```ts
related_departments: z
  .array(z.string().trim().min(1).max(120))
  .max(10, "En fazla 10 ilgili departman")
  .optional()
  .default([]),
```

> Çoklu değer `FormData`'dan `parseForm` ile `string[]` olarak gelir. **Dedup + ana-dept-tekrarı kontrolü route katmanında** yapılır (şema yalnız şekli doğrular; "ana departman hariç" kuralı route'ta `requests.department` bilgisini gerektirir → domain sıfır-I/O kuralına uyum için orada).

Çoklu FormData değerini normalize eden yardımcı route'ta (`collectRelatedDepartments(form)`): `form.related_departments` tek string veya `string[]` olabilir → `string[]`'e çevir, boşları ele, dedup'la.

## Repo (`src/db/repo.ts`)

### `createRequest` imzası genişler

Üçüncü parametre `relatedDepartments: string[] = []` eklenir (varsayılan boş → geriye dönük uyumlu). Transaction içinde, insert'ten sonra her ad için `request_departments`'a satır eklenir (UNIQUE ihlali yok; validation önceden dedup'ladı).

### Yeni/Değişen metodlar

- `listRelatedDepartments(requestId): string[]` — `SELECT department FROM request_departments WHERE request_id = ? ORDER BY name`.
- `listAll(filter)` — `filter.department?: string` eklenir. SQL'e:
  ```sql
  AND (r.department = $dept OR EXISTS (
    SELECT 1 FROM request_departments rd
    WHERE rd.request_id = r.id AND rd.department = $dept
  ))
  ```
  `listByEmail` ve `listForStats` **değişmez** (kullanıcı filtresi yalnız admin listesi).

> `createRequest` transaction'ı: mevcut yapı korunur, `insertAttachments`'ın yanına `insertRelatedDepartments(requestId, names, createdAt)` eklenir.

## Routes (`src/server/routes/`)

### `requests.ts`

- **`POST /api/requests`**: `parseForm` → `collectRelatedDepartments(form)` → `newRequestSchema.safeParse`. Doğrulama sonrası:
  - Her ilgili departman `getDepartmentByName` ile gerçek mi? Yoksa 400.
  - Ana departman (`department`) ilgili listede var mı? Varsa 400 ("Ana departman ilgili listesinde olamaz") — UI zaten engeller ama backend authoritative.
  - `createRequest(input, now, attachments, relatedDepartments)`.
- **`GET /api/requests/:id`**: detay yanıtına `related_departments: string[]` eklenir (zaten `canViewRequest` geçen herkes görür).

### `admin.ts`

- **`GET /api/admin/requests?status=&priority=&department=`**: `department` query param okunur, `repo.listAll({ status, priority, department })`'a geçirilir.

### `definitions.ts` — **değişmez**

## İstemci (`src/client/`)

### `NewRequest.tsx`

Ana departman (`dept`) seçiliyken, **"İlgili Departmanlar"** bölümü: ana departman **hariç** tüm managed departmanlar checkbox/chip listesi. Seçili olanlar state'te (`relatedDept: Set<string>`). Submit'te her biri için `fd.append("related_departments", name)`.

UI desen: mevcut `Dept[]` zaten yüklü (`/api/departments`). Ana dept hariç tutmak için `depts.filter(d => d.name !== dept)`. Toggle chip'leri.

### `RequestMeta.tsx` (veya detail)

Ana departman/application/module satırının yanında/altında ilgili departmanlar **chip** olarak gösterilir: "İlgili: [Lojistik] [IT]". Boşsa hiç render edilmez.

### `Admin.tsx`

Status tab'larının yanına bir **department `<select>`** filtresi eklenir (managed dept listesi `/api/departments`'tan). URL query: `?status=X&department=Y`. Seçili department temizleme ("Tümü") desteği. `apiGet` `/api/admin/requests?status=&department=`.

### `api.ts` — **değişmez** (query string zaten destekleniyor)

## Test (TDD)

- **`validation.test.ts`** — `related_departments` opsiyonel (yok → `[]`), max 10 aşımı hata, boş string eleme (route'ta değil şemada trim).
- **`repo.test.ts`** — `createRequest` relatedDepartments kaydeder + idempotent (UNIQUE), `listRelatedDepartments` sıralı + boş, `listAll({department})` ana VEYA ilgili eşleşmesi (3 senaryo: ana eşleşir, ilgili eşleşir, hiçbiri → hariç), status+department birleşik filtre.
- **`requests.test.ts`** —
  - POST: relateddepartmanlar kaydedilir; managed-olmayan 400; ana dept tekrarı 400; 10 üst sınır; FormData çoklu değer.
  - GET detail: `related_departments` alanı.
- **`admin.test.ts`** — `?department=X`: ana dept talebi gelir, ilgili dept talebi gelir, alakasız gelmez; status ile kombine.
- **`NewRequest`/`RequestMeta`** — istemci bileşen testleri (mevcut desen: render snapshot) opsiyonel; fonksiyonel test Form etkileşimi gerektirir → manuel doğrulamaya bırakılabilir.

## Test schema tuzağı (abonelik özelliğindeki gibi)

Entegrasyon testleri `db.ts` migration'ını kullanmaz → `request_departments` tablosu hem `db.ts`'e hem `src/server/routes/{requests,admin,attachments,definitions}.test.ts` + `src/db/repo.test.ts` içindeki `schema()`'lara eklenmeli.

## Etkilenen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/db/db.ts` | `request_departments` tablosu + indeksler |
| `src/db/repo.ts` | `createRequest` relatedDept param + `listRelatedDepartments` + `listAll` department filtresi |
| `src/db/repo.test.ts` + 4 route test schema() | tabloyu ekle |
| `src/domain/validation.ts` | `related_departments` opsiyonel array |
| `src/domain/validation.test.ts` | yeni alan testleri |
| `src/server/routes/requests.ts` | POST related dept doğrulama + kayıt; GET detail'e `related_departments` |
| `src/server/routes/admin.ts` | `?department` filtresi |
| `src/server/routes/requests.test.ts`, `admin.test.ts` | yeni akışlar |
| `src/client/pages/NewRequest.tsx` | çoklu seçim UI |
| `src/client/components/RequestMeta.tsx` | ilgili dept chip'leri |
| `src/client/pages/Admin.tsx` | department filtre select |

## Kapsam Dışı (YAGNI)

- Dashboard `byDepartment` kırılımı (kullanıcı istemedi; ileride eklenebilir).
- Mail şablonlarında ilgili departman gösterimi.
- İlgili departman başına module seçimi.
- İlgili departman ekleme/çıkarma için ayrı "talep düzenleme" endpoint'i (talep düzenleme henüz yok; sadece oluşturma sırasında).
- Departman silindiğinde `request_departments` hayalet kayıtlarının temizlenmesi.
- Employee `/my` listesinde department filtresi (çalışan kendi taleplerini filtrelemiyor).
