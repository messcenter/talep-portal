# Dosya/Resim Ekleri — Tasarım (Spec)

- **Tarih:** 2026-06-12
- **Durum:** Onaylandı (uygulama planı bekleniyor)
- **Faz:** D (CLAUDE.md §8'de "Şu An Dışı" iken bu spec ile kapsama alınır)
- **İlgili:** `2026-06-12-talep-toplama-design.md`

## 1. Amaç

Çalışanların talep ve cevaplarına **resim (PNG/JPEG/WebP/GIF) ve PDF** ekleyebilmesi.
Tipik kullanım: ekran görüntüsü ile hatayı/isteği göstermek, şartname PDF'i eklemek.
AI/otomasyon yok; tamamen elle yükleme.

## 2. Kapsam

### Dahil
- Ekler **iki yere** iliştirilebilir: yeni talep formu **ve** soru-cevap thread'indeki
  her mesaj (hem talep sahibi cevabı hem admin mesajı).
- İzinli türler: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `application/pdf`.
- Limit: **dosya başına 10 MB**, **yükleme başına en fazla 10 dosya**.
- Ekleri talep detayında görüntüleme: resimler thumbnail, PDF link olarak.

### Dışı (YAGNI — sonraki fazlar)
Thumbnail üretimi (CSS ile küçültme yeterli), EXIF temizleme, virüs tarama,
sürükle-bırak UI, ek silme/yeniden yükleme, orphan dosya temizlik job'u.

## 3. Depolama kararı

**Dosya sistemi** (`uploads/<uuid>.<ext>`), metadata SQLite'ta.

Reddedilen alternatif: SQLite BLOB. Tek-dosya yedek değişmezini korurdu ama
10 MB × 10 dosya/talep ile DB hızla şişer, WAL büyür, her okumada bellek yükü artar.
İç araç için DB'yi hafif tutmak tercih edildi.

**Sözleşme etkisi:** Yedekleme artık `data.db` **+ `uploads/`** klasörünü birlikte
kopyalamayı gerektirir (CLAUDE.md §1 güncellenir). `uploads/` zaten `.gitignore`'da.

## 4. Katmanlama (CLAUDE.md §2)

### `src/domain/attachments.ts` (saf, sıfır I/O)
- Sabitler: `ALLOWED` (uzantı→MIME haritası), `MAX_FILE_BYTES = 10 * 1024 * 1024`,
  `MAX_FILES = 10`.
- `sniffMime(head: Uint8Array): string | null` — magic-byte imzaları:
  - PNG `89 50 4E 47`
  - JPEG `FF D8 FF`
  - GIF `47 49 46 38` (`GIF8`)
  - WebP `52 49 46 46 .. .. .. .. 57 45 42 50` (`RIFF....WEBP`)
  - PDF `25 50 44 46` (`%PDF`)
- `validateUploads(files: UploadMeta[]): { ok: boolean; errors: string[] }`
  - `UploadMeta = { name: string; size: number; head: Uint8Array }` (byte'lar route'ta
    okunur, domain'e saf veri geçer — katman zero-I/O kalır).
  - Kontroller: adet ≤ `MAX_FILES`; her dosya `size ≤ MAX_FILE_BYTES` ve `size > 0`;
    uzantı whitelist'te; **`sniffMime(head)` sonucu uzantının beklenen MIME'ı ile
    eşleşir** (uzantı/içerik uyuşmazlığı reddedilir).
  - Hata mesajları Türkçe (UI'a gider).
- `storageKey(uuid: string, ext: string): string` → `"<uuid>.<ext>"`.
- Exhaustive birim test.

### `src/storage/storage.ts` (YENİ katman — I/O, `Deps` ile enjekte)
```ts
interface Storage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array | null>;
  remove(key: string): Promise<void>;
}
makeFsStorage(rootDir: string): Storage
```
- Yol = `join(rootDir, key)`; `key` yalnız `uuid.ext` — kullanıcı girdisi yola girmez.
- `rootDir` yoksa oluşturulur. Test: temp dizinde put/read/remove roundtrip.
- `Deps`'e `storage: Storage` eklenir (mailer ile aynı enjeksiyon deseni).

### `src/db/` — şema + repo
Yeni tablo (migration `db.ts` içinde, `CREATE TABLE IF NOT EXISTS`):
```sql
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id),
  message_id INTEGER REFERENCES messages(id),   -- NULL = ilk talebe ait
  storage_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_request ON attachments(request_id);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
```
repo metotları:
- `addAttachment(row): AttachmentRow`
- `listAttachmentsByRequest(request_id): AttachmentRow[]`
- `getAttachment(id): AttachmentRow | null`
- Atomiklik: talep/mesaj kaydı + ekleri **tek transaction**. Yeni talep için
  `createRequest` + ekler; cevap için mevcut `addMessageAndTransition` ek parametre
  alır (mesaj + durum geçişi + ekler tek tx). İllegal durumda throw (mevcut davranış).

### `src/routes/`
- **Yeni talep** (`POST /requests`) ve **iki cevap route'u**
  (`POST /requests/:id/reply`, `POST /admin/requests/:id/message`):
  1. multipart gövdeden `files[]` File listesini al.
  2. Her dosyanın byte'larını oku, `head` (ilk ~16 byte) çıkar.
  3. `validateUploads` — hata varsa formu hatalarla yeniden render et (mevcut desen).
  4. Geçerli her dosyayı `storage.put(key, bytes)` ile yaz.
  5. repo'da metadata + talep/mesaj **atomik** kaydet.
  6. DB tx başarısız → yazılan key'ler best-effort `storage.remove`.
- **Servis route'u** `GET /requests/:id/attachments/:attId`:
  - `getAttachment(attId)`; yoksa **404**.
  - `att.request_id === Number(:id)` değilse 404.
  - `canViewRequest(user, getRequest(att.request_id))` değilse **404** (varlık sızdırma yok).
  - `storage.read(key)` null ise 404.
  - Yanıt başlıkları: `Content-Type: att.mime`, `X-Content-Type-Options: nosniff`,
    `Content-Disposition: inline; filename="<esc(original_name)>"`, `Cache-Control: private`.
  - `:id` ve `:attId` için `Number.isInteger` guard (mevcut desen).

### `src/views/`
- **Form'lar** `enctype="multipart/form-data"`, alan:
  `<input type="file" name="files[]" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf">`
  + Türkçe yardım metni (izinli tür, 10 MB, en çok 10 dosya). `_csrf` korunur.
- **Detay görünümü** (`requestDetail`): ekleri grupla — `message_id` NULL olanlar talep
  başlığı altında, diğerleri ilgili mesaj altında. Resim → `<img>` (CSS `max-h`) servis
  route'una link; PDF → ad + boyut ile link. `original_name` her zaman `esc()`.

## 5. CSRF / multipart entegrasyonu (kritik)

`app.ts` CSRF middleware gövdeyi parse edip `_csrf` okuyor. Değişiklikler:
- `parseBody({ all: true })` — aynı isimli çoklu alan (`files[]`) diziye düşsün.
  Mevcut tekil string alanlar etkilenmez (benzersiz isimli).
- Parse öncesi **`Content-Length` ön-kontrolü**: ~110 MB üstü istek erkenden reddedilir
  (10×10MB + form payload payı), bellek koruması.
- `_parsedBody` yeniden-kullanım deseni korunur; `body()` helper File nesnelerini geçirir.
- Tüm upload form'ları `_csrf` taşır (logout muafiyeti aynı).

## 6. Güvenlik kontrol listesi (CLAUDE.md §4)

| Kontrol | Nasıl |
|---|---|
| Auth gate | Yeni route'lar `/auth/*` dışında → mevcut middleware kapsar |
| CSRF | Tüm upload POST'larında `_csrf`; multipart parse `_csrf` okur |
| IDOR | Servis route'u `canViewRequest`; bulunamaz/yetkisiz → 404 |
| Tür doğrulama | Uzantı whitelist **+ magic-byte sniff** (client MIME'ına güvenilmez) |
| Path traversal | storage key = `uuid.ext`; kullanıcı adı yola girmez |
| İçerik sunumu | `nosniff` + açık `Content-Type`; orijinal ad yalnız `Content-Disposition`'da, escaped |
| Boyut/adet | Sunucuda `validateUploads` ile zorlanır (client limiti güvenilmez) |
| Bellek | `Content-Length` ön-kontrolü ile aşırı payload reddi |

## 7. Config

- `.env` / `.env.example`: `UPLOAD_DIR=uploads` (default `uploads`).
- `config.ts`: `uploadDir: z.string().default("uploads")`.
- Limitler (`MAX_FILE_BYTES`, `MAX_FILES`) kod sabiti — env'de değil.

## 8. Test (CLAUDE.md §6, TDD)

- `src/domain/attachments.test.ts` — exhaustive: geçerli her tür, kötü uzantı,
  aşırı boyut, sıfır boyut, fazla adet, magic-byte/uzantı uyuşmazlığı, boş liste.
- `src/storage/storage.test.ts` — temp dizinde put/read/remove; olmayan key read → null.
- `src/db/repo.test.ts` — addAttachment / listByRequest / getAttachment; atomik
  mesaj+ek; NULL message_id (talep eki) vs dolu (mesaj eki).
- `src/routes/public.test.ts` & `admin.test.ts` — yeni talepte/cevapta multipart upload
  (302 + DB kaydı + disk dosyası), servis route yetki (sahip 200, yabancı 404),
  kötü tür reddi (400), aşırı boyut reddi (400), multipart `_csrf` eksik → 403.

## 9. Sözleşme güncellemeleri (bu işle birlikte)

- **CLAUDE.md §1:** "Yedek = `data.db` dosyasını kopyala" → "Yedek = `data.db` **ve
  `uploads/`** birlikte kopyala".
- **CLAUDE.md §2:** katman tablosuna `src/storage/` satırı (dosya I/O, `Deps` ile enjekte).
- **CLAUDE.md §8:** "Görsel/dosya ekleri" maddesi "Şu An Dışı" listesinden çıkarılır.
- **`.env.example`:** `UPLOAD_DIR=uploads` eklenir.

## 10. Açık riskler / notlar

- **Orphan dosya:** DB tx, disk yazımından sonra başarısız olursa best-effort silme
  yapılır; yine de nadir orphan mümkün. Periyodik temizlik şimdilik kapsam dışı.
- **Bellek:** `parseBody` multipart'ı belleğe alır; `Content-Length` ön-kontrolü üst
  sınırı (~110 MB) sınırlar. İç araç, düşük eşzamanlılık varsayımıyla kabul edilebilir.
- **UI makyajı** ayrı bir tur olarak ele alınacak; bu spec yalnız ek işlevini kapsar.
