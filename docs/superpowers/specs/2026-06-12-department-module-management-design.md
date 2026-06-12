# Departman & Modül Yönetimi — Tasarım

- **Tarih:** 2026-06-12
- **Durum:** Onaylandı (brainstorm)
- **Bağlam:** Bun.serve + React SPA portalı (bkz. `2026-06-12-bun-spa-migration-design.md`).

## 1. Amaç

Yeni Talep formundaki **Departman** ve **Modül/Alan** alanları şu an serbest metin.
Admin'in tanımlı bir liste yönetmesini ve talep edenlerin bu listeden **katı** seçim
yapmasını sağlamak — veri tutarlılığı (ileride raporlama/dashboard için temiz).

## 2. Kararlar (brainstorm)

| Karar | Seçim |
|---|---|
| Katılık | **Katı seçim** — yalnız admin listesinden; serbest metin yok |
| Modül yapısı | **Departmana bağlı** — departman seçilince ilgili modüller gösterilir |
| Modül zorunluluğu | Opsiyonel (departmanın modülü yoksa gizlenir) |
| Talep saklama | `requests.department`/`module_area` **TEXT snapshot** olarak kalır (şema değişmez) |
| Silme | Hard delete; departman silinince modülleri cascade; eski talepler etkilenmez |

## 3. Veri Modeli (yeni 2 tablo + migration)

```sql
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(department_id, name)
);
```
`requests` şeması **değişmez** — `department`/`module_area` snapshot text. Tanımların
silinmesi/yeniden adlandırılması geçmiş talepleri bozmaz.

`migrate()` (src/db/db.ts) bu tabloları ekler. `PRAGMA foreign_keys = ON` zaten açık →
cascade çalışır.

## 4. Katmanlama

- **`src/db/repo.ts`** — yeni repo metotları: `listDepartmentsWithModules()`,
  `createDepartment(name, now)`, `deleteDepartment(id)`, `createModule(deptId, name, now)`,
  `deleteModule(id)`, `getDepartmentByName(name)`, `listModuleNames(deptId)`. UNIQUE ihlali
  → anlamlı hata (yakalanıp 409/400'e çevrilir).
- **`src/domain/validation.ts`** — şekil doğrulaması (string non-empty) korunur. Katılık
  DB durumuna bağlı olduğu için **domain'de değil**, route handler'da yapılır (zero-I/O kuralı).
- **`src/server/routes/`** — yeni handler'lar (aşağıda). Talep oluşturma (`requests.ts`)
  katılık kontrolü ekler.

## 5. API

| Method | Path | Auth | Body | Döner |
|---|---|---|---|---|
| GET | `/api/departments` | session | — | `[{id,name,modules:[{id,name}]}]` |
| POST | `/api/admin/departments` | admin+CSRF | `{name}` | `201 {id}` (boş/duplike → 400/409) |
| DELETE | `/api/admin/departments/:id` | admin+CSRF | — | `204` (yok → 404) |
| POST | `/api/admin/departments/:id/modules` | admin+CSRF | `{name}` | `201 {id}` (dept yok→404, duplike→409) |
| DELETE | `/api/admin/modules/:id` | admin+CSRF | — | `204` (yok → 404) |

Mutating'ler `X-CSRF-Token` ister (handler `DELETE`'i de kapsar). Admin route'ları `isAdmin`.

**Talep oluşturma katılığı (`POST /api/requests`):** şema parse'ından sonra:
- `department` admin listesinde değilse → `400 {errors:["Geçersiz departman"]}`.
- `module_area` doluysa ve o departmanın modülü değilse → `400 {errors:["Geçersiz modül"]}`.
- Boş `module_area` serbest (opsiyonel).

## 6. Frontend

- **Yeni admin sayfası** `src/client/pages/Definitions.tsx`, route `/admin/tanimlar`:
  - `GET /api/departments` ile listeyi yükler.
  - Departman ekle (input + "Ekle"), departman sil (✕). Her departmanın altında modülleri
    listeler; modül ekle/sil. Tüm mutasyonlar `apiSend` (CSRF) → başarıda refetch.
  - Admin header'a "Tanımlar" linki (yalnız `isAdmin`).
- **`src/client/pages/NewRequest.tsx`:** "Departman" select (`GET /api/departments`'tan;
  zorunlu). Seçili departmana göre "Modül/Alan" select (o departmanın modülleri; opsiyonel;
  modül yoksa alanı gizle). Departman yoksa bir uyarı + form submit engellenir.

## 7. Test

- **repo:** departman/modül CRUD, UNIQUE ihlali, cascade delete (departman silinince modüller
  gider; ilgili eski talepler text snapshot olarak durur).
- **API:** admin authz 403 (non-admin tüm yönetim route'larında); CSRF eksik → 403; departman
  ekle 201 / duplike 409 / boş 400; modül ekle (dept yok 404 / duplike 409); GET /api/departments
  yapısı.
- **Talep katılığı:** geçersiz departman → 400; yanlış departmana ait modül → 400; geçerli →
  201; boş modül → 201.
- **Frontend:** `bun run build` gate; (DOM harness yoksa render testi opsiyonel).

## 8. Kapsam Dışı (YAGNI)

- Rename/edit (silip yeniden ekle yeterli).
- Soft-delete / active flag / sıralama.
- Modülün `application`'a bağlanması.
- Mevcut serbest-metin taleplerini geriye dönük normalize etmek (snapshot korunur).

## 9. Riskler

- **Boş başlangıç:** hiç departman yokken form gönderilemez → admin önce tanımlamalı.
  Migration veri seed'lemez; UI net bir "önce departman tanımlayın" mesajı gösterir.
- **Snapshot vs canlı liste:** rapor/dashboard ileride snapshot text üzerinden çalışır;
  yeniden adlandırma eski kayıtları değiştirmez (kabul edilen davranış).
