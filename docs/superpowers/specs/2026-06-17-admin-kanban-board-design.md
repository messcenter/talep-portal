# Admin Kanban Panosu — Tasarım

**Tarih:** 2026-06-17
**Durum:** Onaylandı (uygulama bekliyor)

## Problem

Admin'in açık talepleri tek bakışta, iş akışı aşamalarına göre görmesinin bir
yolu yok. Mevcut `/admin/talepler` listesi durum-filtre sekmeleriyle çalışır ama
tüm aktif işi yan yana sütunlarda göstermez. Admin "hangi aşamada ne var,
bende ne bekliyor" sorusunu hızlı yanıtlayamıyor.

## Çözüm

Salt-görsel bir Kanban panosu: aktif talepler durumlarına göre sütunlara
yerleştirilir. Sürükle-bırak yok — kart tıklanınca mevcut talep detayına gidilir,
durum değişimi orada (mevcut akışla) yapılır.

### Sütunlar (5 aktif durum)

Soldan sağa iş akışı sırasıyla:

| sütun | durum slug | label |
|---|---|---|
| 1 | `new` | Yeni |
| 2 | `clarifying` | Netleştiriliyor |
| 3 | `answered` | Cevaplandı |
| 4 | `accepted` | Kabul edildi |
| 5 | `in_progress` | Yapılıyor |

Terminal durumlar (`done`, `rejected`, `cancelled`) panoda **gösterilmez** —
onlara liste görünümünden bakılır.

- Her sütun başlığında o durumdaki **kart sayısı** rozeti bulunur.
- Boş sütun soluk bir yer tutucu ("—" veya kısa metin) gösterir.

### Sıralama (sütun içi)

Önce **öncelik** (Yüksek → Orta → Düşük), eşitlikte **son hareket** zamanı
(eskiden yeniye — en bayat üstte). Böylece bekleyen/yüksek öncelikli işler üste
çıkar.

### Yerleşim & rota

- Yeni rota `/admin/pano`, `AdminLayout` altında, kod-split lazy (diğer route
  sayfaları gibi `app.tsx`'te `lazy(() => import(...))`).
- `AdminLayout` sidebar'ına **"Pano"** navigasyon linki eklenir (Talepler'in
  yanına).
- Sütunlar yatay dizilir: geniş ekranda 5 eşit sütun, dar ekranda yatay kaydırma
  (`overflow-x-auto` + sütun `min-width`). Kanban geleneği.

### Veri akışı

- Mevcut `GET /api/admin/requests` (filtresiz — tüm talepler) çağrılır.
- **İstemci tarafında** 5 aktif duruma göre süzülüp sütunlara gruplanır.
- Yeni backend endpoint **yok**; iç araç, düşük hacim. Filtresiz çağrı terminal
  talepleri de getirir ama istemci eler — kabul edilebilir.

## Mimari / Bileşenler

İzole, tek sorumluluklu birimler:

### 1. `src/client/board.ts` (saf mantık, zero DOM/React)

- `export const BOARD_COLUMNS: RequestStatus[]` = `["new", "clarifying",
  "answered", "accepted", "in_progress"]` (terminal yok).
- `export function groupForBoard(rows: RequestRow[]): Record<BoardStatus, RequestRow[]>`
  — her `BOARD_COLUMNS` durumu için, o duruma ait satırları sıralama kuralıyla
  sıralı döndürür; **duruma göre anahtarlanmış** (konumsal değil) — çağıran
  `columns[status]` ile okur, indeks bağlanımı yok. Terminal/bilinmeyen durumlar
  elenir (anahtarı oluşmaz). `BoardStatus` = aktif durumların union'ı.
- Öncelik sırası için yardımcı: `PRIORITY_RANK = { high: 0, medium: 1, low: 2 }`.
- React/TipTap/ProseMirror import grafiğinden **uzak tutulur** (birim testi
  DOM'suz koşsun — `adminActionsFor` dersindeki gibi).

`RequestRow` tipi `src/client/components/RequestCard.tsx`'ten import edilir
(zaten orada `export interface RequestRow`). `board.ts` yalnız bu tipi (type-only)
ve `RequestStatus`'u alır; RequestCard'ın React kodunu çekmez (type-only import).

### 2. `src/client/pages/Board.tsx`

- Mount'ta `apiGet<RequestRow[]>("/api/admin/requests")` çağırır.
- Yükleme: `Spinner`; hata: `Admin.tsx`'teki `role="alert"` desenini izleyen
  hata kutusu.
- `groupForBoard(rows)` ile gruplar; `BOARD_COLUMNS` üzerinden sütunları,
  her sütunda kartları render eder. Sütun başlığı `statusLabelTr(status)` +
  sayı rozeti.
- Kartlar `RequestCard` ile, `basePath="/admin/requests"`, `showStatus={false}`.
- `useUser().isAdmin` değilse `<Navigate to="/my" replace />` (Admin/Dashboard
  deseni).

### 3. `RequestCard` (mevcut, küçük ek)

- Opsiyonel prop `showStatus?: boolean` (default `true`). `false` ise sağ üstteki
  `StatusBadge` render edilmez (sütun zaten tek durum → rozet gereksiz).
- MyList ve diğer kullanımlar default `true` ile değişmez.

### 4. `app.tsx` + `AdminLayout`

- `app.tsx`: `const Board = lazy(() => import("./pages/Board"))`; `AdminLayout`
  route grubuna `<Route path="/admin/pano" element={<Board />} />`.
- `AdminLayout`: sidebar nav listesine "Pano" linki (`/admin/pano`), mevcut link
  stiliyle.

## Test

TDD: önce başarısız test → minimal kod → yeşil.

- **`src/client/board.test.ts`** (saf, DOM'suz):
  - `BOARD_COLUMNS` tam olarak 5 aktif durumu, doğru sırada içerir; terminal
    durum içermez.
  - `groupForBoard`: terminal (`done`/`rejected`/`cancelled`) satırlar elenir;
    her aktif satır doğru sütun indeksine düşer; sütun içi öncelik sıralaması
    (high önce); öncelik eşitse son-hareket eskiden yeniye; boş girdi → 5 boş
    sütun; toplam aktif kart sayısı korunur.
- **`src/client/components/StatusBadge.test.tsx` veya RequestCard testi**:
  `RequestCard` `showStatus={false}` iken durum label'ını render etmediğini,
  `showStatus` verilmeyince (default) render ettiğini doğrula (`renderToStaticMarkup`).

## Kapsam Dışı (YAGNI)

- Sürükle-bırak ile durum değiştirme (ayrı faz; FSM yasak geçiş + gerekçe
  zorunluluğu nedeniyle ek tasarım gerektirir).
- Pano üzerinde departman/uygulama/öncelik filtresi (liste görünümünde mevcut).
- Terminal/arşiv sütunu veya "bitti" kolonu.
- Gerçek zamanlı güncelleme / otomatik yenileme.
