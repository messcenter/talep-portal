# Talep → Markdown Export (Admin) — Design

**Tarih:** 2026-06-13
**Kapsam:** Tek bir talebi (metadata + soru-cevap akışı + ek adları) Markdown olarak
indirme. **Yalnızca yönetici** özelliği.

## Amaç

Admin'in bir talebi tek tıkla `.md` olarak dışa aktarması — paylaşmak, arşivlemek
veya ileride elle GitHub issue'ya taşımak için. AI/otomasyon yok; saf biçimlendirme.

## Tasarım

### 1. Saf formatter (domain) — `src/domain/export.ts`

```ts
export function requestToMarkdown(data: {
  request: RequestRow;
  messages: MessageRow[];
  attachments: AttachmentRow[];
}): string
```

- **Zero I/O**, saf fonksiyon (CLAUDE.md §2 katmanlama). Exhaustive birim test.
- Tür tanımları domain'de mevcut/erişilebilir olmalı. `RequestRow`/`MessageRow`/
  `AttachmentRow` şu an istemci bileşenlerinde tanımlı; formatter'ın bunlara
  domain'den bağlı kalmaması için, formatter **ihtiyacı olan alanları** içeren dar
  `interface`'leri `export.ts` içinde kendisi tanımlar (yapısal tipleme — çağıran
  taraf zaten uyumlu nesne geçer). Böylece domain → client bağımlılığı oluşmaz.

**Üretilen Markdown iskeleti:**

```markdown
# {request_no} · {title}

| Alan | Değer |
|---|---|
| Durum | {status label TR} |
| Öncelik | {priority label TR} |
| Tür | {request_type label TR} |
| Departman | {department} |
| Uygulama | {application} |
| Modül / Alan | {module_area veya "—"} |
| Talep eden | {requester_name} ({requester_email}) |
| Oluşturma | {created_at} |

## Açıklama

{description}

## Beklenen Fayda

{expected_benefit}

## Yazışma

### {yazar etiketi} · {created_at}

{message body}

(her mesaj için tekrar; mesaj yoksa "_Henüz mesaj yok._")

## Ekler

- {original_name}
- {original_name}

(ek yoksa "_Ek yok._" — yalnızca dosya adları, indirme linki yok)
```

**Label kaynakları (server-side Türkçe — mail şablonlarıyla aynı desen):**
- Durum: mevcut `src/domain/status.ts` Türkçe label'ı yeniden kullanılır. Halihazırda
  dışa açık bir erişimci yoksa, küçük saf bir `statusLabel(s): string` export'u eklenir.
- Öncelik / tür: bu label'lar şu an yalnızca `src/client/labels.ts`'te. Domain client'a
  bağlanamayacağı için, öncelik ve tür Türkçe map'leri `export.ts` içinde (veya küçük
  bir domain modülünde) saf sabit olarak tanımlanır. İstemci `labels.ts` ile küçük bir
  tekrar oluşur; bu, katman yönünü doğru tutmak için kabul edilir (DRY'ı domain↔client
  birleştirmesi bu spec'in kapsamı dışında).

**Markdown güvenliği:** Bu bir indirilen `.md` dosyası, tarayıcıda HTML olarak
render edilmiyor; XSS riski yok. Kullanıcı metni (başlık, gövde) markdown özel
karakterleri içerebilir ve çıktının biçimini bozabilir — bu, bir export için kabul
edilebilir. Tablo hücrelerine giren tek-satır alanlarda (başlık vb.) `|` ve newline
basit şekilde boşlukla değiştirilir ki tablo bozulmasın; çok-satır gövdeler
(açıklama, mesaj) gövde bölümlerinde olduğu gibi bırakılır.

### 2. Sunucu route (admin-only) — `src/server/routes/admin.ts`

`handleAdmin` dispatcher'ına yeni dal:

```
GET /api/admin/requests/:id/export.md
```

- Regex: `^/api/admin/requests/(\d+)/export\.md$` → `id` NaN guard (regex zaten `\d+`).
- `if (!user.isAdmin) return 403` — kardeş admin route'larıyla aynı.
- Talebi + mesajları + ekleri repo'dan çeker (detay endpoint'iyle aynı veri). Talep
  yoksa **404**.
- `requestToMarkdown(...)` çağrılır, dönen string `Response` olarak verilir:
  - `Content-Type: text/markdown; charset=utf-8`
  - `Content-Disposition: attachment; filename="{request_no}.md"` (request_no ascii,
    güvenli).
- GET olduğu için CSRF muaf; `/api/*` auth gate session'ı zaten zorlar. Aynı-origin
  cookie taşındığından tarayıcıdan indirme çalışır.

### 3. İstemci — `src/client/pages/RequestDetailAdmin.tsx`

- Sayfa başlığı / aksiyon alanına **"Markdown indir"** düğmesi.
- Uygulaması: `<a href={`/api/admin/requests/${id}/export.md`} download>` (buton
  stilinde). Admin oturumlu olduğundan basit link yeterli; api.ts'in 401 redirect'ine
  gerek yok. Yeni client state'i yok.

## Test

- **Formatter** (`src/domain/export.test.ts`) — exhaustive: tüm metadata satırları;
  modül boş → "—"; mesaj yok → "_Henüz mesaj yok._"; ek yok → "_Ek yok._"; birden
  çok mesaj/ek; başlıkta `|`/newline kaçışı tabloyu bozmuyor; durum/öncelik/tür
  label'ları Türkçe basılıyor.
- **Route** (`src/server/routes/admin.test.ts`) — in-memory SQLite + mock auth ile:
  admin → 200, `Content-Type: text/markdown`, `Content-Disposition` doğru filename;
  gövde beklenen başlığı içeriyor. Non-admin → 403. Bilinmeyen id → 404.
- `bun test` yeşil olmadan commit yok. TDD.

## Kapsam dışı (bilinçli)

- Liste/toplu export, çalışan tarafında düğme, PDF/diğer formatlar.
- Eklerin indirme linki (yalnızca ad).
- "Kabul edildi → GitHub issue" otomasyonu (Faz D).
- client `labels.ts` ile domain label'larının DRY birleştirilmesi.
