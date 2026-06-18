# Talep Takipçileri (Subscribers) — Tasarım

**Tarih:** 2026-06-18
**Durum:** Onaylandı (uygulama bekliyor)

## Problem

Şu an bir talebi yalnızca **talep eden** ve **adminler** görür/mail alır. Bir talep
departman içinde birden fazla kişiyi ilgilendiriyorsa (ör. "bu talebe Ayşe de vakıf,
haberdar olsun", "şuraya beraber bakalım"), ortada bir **takipçi/cc** kavramı yok. İnsanlar
talebi manuel forward'lamak zorunda.

Çözüm: bir talebe **email ile takipçi ekleme** (CC/davet modeli). Takipçi eklenen kişi
talep detayını görür ve belirlenen olaylarda mail alır.

## Çözüm Özeti

- **Davet/CC modeli:** yalnız **talep eden** veya **admin** bir takipçi ekleyip çıkarır
  (email ile, kurumsal domain doğrulamalı). Self-service herkes açma yok → gizlilik korunur.
- **Self-unsubscribe:** davet edilen kişi kendini çıkarabilir (aboneliği spam ise).
- **Görünürlük:** takipçi olan kişi talep detayını (istek + thread + ekler) görebilir;
  maildeki bağlantı çalışır.
- **Bildirim olayları** (takipçilere):
  - ✅ her yeni mesaj (admin sorusu **ve** talep eden cevabı)
  - ✅ karar (`accepted` / `rejected` / `done` / `cancelled`)
  - ❌ yeni talep oluşturma (henüz takipçi yok)
  - ❌ `in_progress` (gürültü azaltma — talep edene de gönderilmiyor)
  - ✅ takipçi olarak eklendiğinizde hoş-geldiniz bildirimi (yalnız yeni takipçiye)
- **Alıcı dedup:** bir olayda requester/admin/takipçi kümelerini birleştir, `Set` ile
  tekilleştir, olayı tetikleyen kişiyi (`excludeEmail`) hariç tut.

## Kararlar (load-bearing)

1. **Kim takipçi yönetebilir:** `canManageSubscribers = isAdmin || email == requester_email`.
2. **Takipçi çıkarma:** `canManageSubscribers` **veya** `email == user.email` (self-unsubscribe).
3. **Domain doğrulaması:** eklenen email `GOOGLE_HOSTED_DOMAIN` ile eşleşmeli (spoof'a karşı,
   OAuth `hd` ile aynı sınır). Bkz. `verifyDomain` mantığı; burada email suffix kontrolü yeterli
   (Google'dan gelmiş email olmadığı için `hd` claim yok).
4. **Email normalize:** tüm email karşılaştırmaları küçük-harf (mevcut kurala uyum).
5. **Idempotent ekleme:** aynı emaili tekrar eklemek hata değil, no-op (UNIQUE kısıtı + INSERT OR IGNORE).
6. **Takipçi listesi görünürlüğü:** talebi gören herkes (`canViewRequest`) takipçi email listesini
   görür. Kurum içi paylaşım → sorun yok. İsim gösterilmez (sadece email; Google profil verisi
   talep detayında taşınmaz).
7. **URL ayrımı:** maildeki detay bağlantısı `audience`'a göre: admin → `/admin/requests/:id`,
   diğerleri → `/requests/:id`. Takipçi `/requests/:id` rotasında görür (employee layout).
8. **Terminal talepler:** takipçi ekleme terminal (`done`/`rejected`/`cancelled`) taleplerde de
   serbest — kayıt amaçlı (tarihi talebe not gözüyle bakmak). Yine de çoğu olay zaten gelmeyecek.

## Veri Modeli

`src/db/db.ts` migration'a yeni tablo eklenir (mevcut `CREATE TABLE IF NOT EXISTS` akışına uyumlu):

```sql
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  added_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(request_id, email)
);
CREATE INDEX IF NOT EXISTS idx_subscribers_request ON subscribers(request_id);
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
```

- `email` normalize (lower-case) tutulur.
- `added_by_email`: kim ekledi (gelecekte audit log'a taşınacak; şimdilik burada).
- `ON DELETE CASCADE`: talep silinince takipçiler de gider (talep silme şu an yok ama tutarlılık için).

## Domain (`src/domain/authz.ts`)

`canViewRequest` imzası **değişmez** sıfır-I/O kuralını korumak için; bunun yerine takipçi
bilgisi çağıran (route) tarafından sağlanır — parametre olarak genişletilir:

```ts
export function canViewRequest(
  user: User,
  req: RequestRef,
  isSubscriber: boolean = false,
): boolean {
  if (user.isAdmin) return true;
  if (user.email.toLowerCase() === req.requester_email.toLowerCase()) return true;
  return isSubscriber;
}
```

Yeni yardımcılar:

```ts
export function canManageSubscribers(user: User, req: RequestRef): boolean {
  if (user.isAdmin) return true;
  return user.email.toLowerCase() === req.requester_email.toLowerCase();
}

// Takipçiyi listeden kim çıkarabilir: yönetici veya kişinin kendisi (self-unsubscribe).
export function canRemoveSubscriber(user: User, req: RequestRef, targetEmail: string): boolean {
  if (user.email.toLowerCase() === targetEmail.toLowerCase()) return true; // self
  return canManageSubscribers(user, req);
}
```

`canReply` değişmez (yalnız talep eden, `clarifying` durumunda).

### `src/domain/hosted-domain.ts` (yeni)

Email→domain doğrulaması domain katmanına çekilir (mail templates'teki yerel `esc`'e benzer
yerel-yardımcı prensibi; auth/google.ts'teki `verifyDomain` profile'a bakar, burada raw email
geldiği için suffix kontrolü):

```ts
export function isHostedDomain(email: string, hostedDomain: string): boolean {
  const e = email.trim().toLowerCase();
  return e.endsWith("@" + hostedDomain.toLowerCase());
}
```

## Repo (`src/db/repo.ts`)

Yeni tipler:

```ts
export type SubscriberRow = {
  id: number;
  request_id: number;
  email: string;
  added_by_email: string;
  created_at: string;
};
```

Yeni metodlar:

- `addSubscriber(requestId, email, addedByEmail, createdAt): SubscriberRow | null`
  — `INSERT OR IGNORE` +RETURNING; eklenmediyse (zaten var) `null`. Email normalize.
- `removeSubscriber(requestId, email): boolean` — `DELETE … WHERE request_id=? AND email=?`;
  etkilenen satır sayısı > 0 ise true.
- `isSubscriber(requestId, email): boolean` — EXISTS sorgusu.
- `listSubscribers(requestId): SubscriberRow[]` — `ORDER BY id ASC`.

Tüm email parametreleri küçük-harf normalize edilerek sorgulanır/kaydedilir.

## Routes (`src/server/routes/`)

### `requests.ts` — takipçi uçnokaları (employee tarafı, talep edenin kullanımı için)

- `POST /api/requests/:id/subscribers`
  - body: `email` (tek değer).
  - yetki: `canManageSubscribers(user, r)` değilse **403**.
  - domain: `isHostedDomain(email, config.googleHostedDomain)` değilse **400**
    ("Yalnızca kurumsal hesaplar eklenebilir").
  - `email == requester_email` ise **400** ("Talep sahibi zaten bildirim alıyor") — anlamsız çift.
  - idempotent ekleme; sonra yeni takipçiye hoş-geldiniz maili (`subscriberWelcome`).
  - 201 + `{ ok: true }` (eklendi) veya 200 (zaten vardı). Basitleştirme: her zaman 201, no-op ise 200.
- `DELETE /api/requests/:id/subscribers`
  - body: `email` veya query `?email=`.
  - yetki: `canRemoveSubscriber(user, r, email)` değilse **403**.
  - `removeSubscriber`; bulunamazsa **404**. 204.

> Bu uçnokalar `/api/requests/:id` ad alanında → hem employee hem admin (admin de bu yolu
> kullanabilir) erişir. IDOR: önce `getRequest` + mevcut request yoksa **404**.

### `GET /api/requests/:id` — mevcut detay yanıtı genişletilir

```json
{
  "request": {...},
  "messages": [...],
  "attachments": [...],
  "subscribers": [{ "id":1, "email":"...", "added_by_email":"...", "created_at":"..." }],
  "isSubscriber": false
}
```

`subscribers` yalnızca `canViewRequest` true ise döner; aksi halde zaten 404. `isSubscriber`
 alanı mevcut kullanıcının durumunu belirtir (UI butonu için).

### Mevcut mesaj/karar handler'larında alıcı genişletme

- `POST /api/requests/:id/reply` (requester cevapladı):
  - mevcut: adminlere `replyAdmin`.
  - **ek:** takipçilere tarafsız şablon (`subscriberMessage`), olay faili (requester) hariç.
- `POST /api/admin/requests/:id/message` (admin soru sordu):
  - mevcut: requester'a `questionRequester`.
  - **ek:** takipçilere tarafsız şablon (`subscriberMessage`), admin (fail) hariç.
- `POST /api/admin/requests/:id/decision`:
  - mevcut: requester'a `decisionRequester` (`in_progress` hariç).
  - **ek:** takipçilere tarafsız şablon (`subscriberDecision`), admin (fail) hariç; `in_progress` hariç.

Alıcı hesaplama yardımcısı (`src/mail/recipients.ts` veya templates içinde lokal):

```ts
export function collectRecipients(opts: {
  requesterEmail: string;
  subscribers: string[];          // takipçi emailleri
  includeRequester?: boolean;
  includeSubscribers?: boolean;
  excludeEmail?: string;          // olay faili
}): string[] {
  const set = new Set<string>();
  if (opts.includeRequester) set.add(opts.requesterEmail.toLowerCase());
  if (opts.includeSubscribers) for (const s of opts.subscribers) set.add(s.toLowerCase());
  if (opts.excludeEmail) set.delete(opts.excludeEmail.toLowerCase());
  return [...set];
}
```

Her alıcı tek mail (mailer zaten döngüde). Hala best-effort (`.catch(() => {})`).

## Mail (`src/mail/templates.ts`)

### Yeni: `audience` parametreli detay-URL yardımcısı

```ts
function detailUrl(baseUrl: string, id: number, audience: "requester" | "admin" | "subscriber"): string {
  return audience === "admin"
    ? `${baseUrl}/admin/requests/${id}`
    : `${baseUrl}/requests/${id}`;
}
```

### Yeni tarafsız şablonlar (sadece takipçilere)

- `subscriberMessage(r, baseUrl, byName, authorRole, audience="subscriber")`
  - konu: `Güncelleme: ${request_no}`
  - gövde: "<strong>{request_no}</strong> — {title} talebine {byName} ({role}) bir mesaj ekledi."
  - CTA: "Talebi görüntüle" → `/requests/:id`
- `subscriberDecision(r, baseUrl, target, audience="subscriber")`
  - `decisionRequester` ile paralel; "Takip ettiğiniz talep {label}." + opsiyonel gerekçe.
  - `target ∈ {accepted, rejected, done, cancelled}` (`in_progress` çağrılmaz).
- `subscriberWelcome(r, baseUrl, addedByName)`
  - konu: `Takipçi olarak eklendiniz: ${request_no}`
  - gövde: "{addedByName} sizi <strong>{request_no}</strong> — {title} talebine takipçi olarak ekledi."
  - CTA → `/requests/:id`.

> `byName`/`addedByName` için `user.name` handler'dan geçilir (session'da var).

### Mevcut şablonlar korunur

`newRequestAdmin`, `newRequestRequester`, `questionRequester`, `replyAdmin`,
`decisionRequester` imzaları **değişmez** — yalnızca takipçiler için ayrı şablon
kullanılır. Bu, mevcut testlerin bozulmamasını sağlar.

## İstemci (`src/client/`)

### `RequestDetailEmployee.tsx` + `RequestDetailAdmin.tsx`

- Detay yanıtı artık `subscribers` + `isSubscriber` taşır → `DetailData` tipi genişletilir.
- **Takipçi paneli:** abone listesi (email) + ekleme/çıkarma UI.
  - Ekleme: küçük inline form (email input + "Ekle"). Yetki: `canManageSubscribers` →
    client tarafı `user.isAdmin || user.email === request.requester_email` ile basılan UI.
  - Self-unsubscribe: eğer kullanıcı listedeyse "Takipten çık" butonu.
- Admin detayında da aynı panel (admin herkesi yönetebilir).

### `api.ts`

- `apiSend("/api/requests/:id/subscribers", "POST", fd)` / `DELETE`.

### `labels.ts`

- Gerekirse "Takipçiler", "Takipçi ekle", "Yalnızca kurumsal hesaplar" UI metinleri.

## Güvenlik Kontrol Listesi (CLAUDE.md §4 uyum)

- [x] Auth gate: `/api/requests/:id/subscribers*` `/api/*` altında → otomatik kaplı.
- [x] CSRF: mutating (POST/DELETE) → `X-CSRF-Token` doğrulaması mevcut handler'da.
- [x] IDOR: `getRequest` + yetki kontrolü önce; yoksa **404** (varlık sızdırma yok).
- [x] Domain: eklenen email `isHostedDomain` değilse **400**.
- [x] NaN guard: `:id` Number parse + `Number.isInteger`.
- [x] Self-request kuralı: takipçi yönetiminde "kendi talebinde admin işlemi yapamaz"
  kuralı uygulanmaz (bu yalnız karar/netleştirme içindi); talep eden kendi talebine
  takipçi ekleyebilir — bu istenen davranış.
- [x] Alıcı dedup + faili hariç tut: aynı kişi iki mail almaz.
- [x] Attachment IDOR: takipçi `canViewRequest` true olduğu için ekleri de görür (mevcut
  `attachments.ts` `canViewRequest` kullanır — değişiklik gerekmez, ama `isSubscriber`
  parametresi geçilmeli).

> **Önemli:** `src/server/routes/attachments.ts` içindeki `canViewRequest(user, r)` çağrısı
> güncellenmeli → `canViewRequest(user, r, repo.isSubscriber(att.request_id, user.email))`.

## Test (TDD)

- **`authz.test.ts`** — `canViewRequest` 3. parametreyle (subscriber true/false tüm kombinasyon);
  `canManageSubscribers` (admin/requester/3. kişi); `canRemoveSubscriber` (self/admin/3. kişi).
- **`hosted-domain.test.ts`** — `isHostedDomain` doğru/yanlış domain + case-insensitive.
- **`repo.test.ts`** — `addSubscriber` (yeni + idempotent + normalize), `removeSubscriber`
  (var/yok), `isSubscriber`, `listSubscribers` (sıralı), `ON DELETE CASCADE` yok (talep silme
  yok) ama UNIQUE kısıtı duplicate'te.
- **`templates.test.ts`** — `subscriberMessage`/`subscriberDecision`/`subscriberWelcome`
  içerik + URL (`/requests/:id`), gerekçe; `decisionRequester` imza değişmedi (regresyon).
- **`requests.test.ts`** —
  - `POST /subscribers`: 201 happy; idempotent 200; domain-dışı 400; requester'ı ekleme 400;
    yetkisiz (3. kişi) 403; bulunmayan talep 404; welcome maili mock kontrolü.
  - `DELETE /subscribers`: 204; self-unsubscribe; yetkisiz 403; yok 404.
  - `GET /requests/:id`: subscribers + isSubscriber alanları; abone görür (200), 3. kişi 404.
  - reply → takipçiye mail (mock); admin'e mevcut mail korunur.
- **`admin.test.ts`** — message + decision → takipçilere tarafsız şablon maili;
  `in_progress`'te takipçiye mail **yok**.
- **`attachments.test.ts`** — takipçi ekini indirir (200); abone olmayan 3. kişi 404.
- **`AdminControls.test.tsx`** / yeni panel testi — UI ekleme/çıkarma akışı (enqueue).

## Etkilenen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/db/db.ts` | `subscribers` tablosu + indeksler |
| `src/db/repo.ts` | `SubscriberRow` + 4 metod |
| `src/domain/authz.ts` | `canViewRequest` 3. parametre, `canManageSubscribers`, `canRemoveSubscriber` |
| `src/domain/hosted-domain.ts` | **yeni** `isHostedDomain` |
| `src/server/routes/requests.ts` | `POST/DELETE /subscribers`, detay yanıtına `subscribers`/`isSubscriber`, reply'de takipçi maili |
| `src/server/routes/admin.ts` | message + decision'da takipçi maili |
| `src/server/routes/attachments.ts` | `canViewRequest`'e `isSubscriber` geç |
| `src/mail/templates.ts` | `detailUrl`, `subscriberMessage`, `subscriberDecision`, `subscriberWelcome` |
| `src/mail/recipients.ts` | **yeni** `collectRecipients` |
| `src/client/hooks/useRequestDetail.ts` | `DetailData` + `subscribers`/`isSubscriber` |
| `src/client/components/Subscribers.tsx` | **yeni** panel |
| `src/client/pages/RequestDetailEmployee.tsx` | panel entegrasyonu |
| `src/client/pages/RequestDetailAdmin.tsx` | panel entegrasyonu |
| `src/client/labels.ts` | UI metinleri |

## Kapsam Dışı (YAGNI)

- Takipçi bildirim tercihleri (event başına abone-opt-out). Şimdilik tüm takipçiler tüm olayları alır.
- "Takipçi olarak eklendiniz" davet linki/token (onaylı ekleme). Doğrudan eklenir.
- Takipçi listesinin email-dışı (isim/görsel) gösterimi.
- Departman bazlı otomatik takipçi (ileride rol bazlı görünürlük gelirse).
- `in_progress` bildirimi (gürültü azaltma kararı).
- Toplu takipçi içe aktarım.
