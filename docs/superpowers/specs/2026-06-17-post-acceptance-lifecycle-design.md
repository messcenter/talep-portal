# Kabul Sonrası Yaşam Döngüsü — Tasarım

**Tarih:** 2026-06-17
**Durum:** Onaylandı (uygulama bekliyor)

## Problem

Mevcut durum makinesinde `accepted` ve `rejected` ikisi de terminal. Bir talep
kabul edildiğinde aslında iş yeni başlıyor (geliştirilecek), ama sistem bunu
"kapandı" sayıyor. Kabul ile reddi aynı kefeye koymak yanlış: reddedilen talep
gerçekten biter, kabul edilen talep takip edilmelidir.

Ek olarak, kabul edilmiş bir talebin sonradan **yapılamayacağı** anlaşılabilir.
Bunu "reddedildi" ile karıştırmamak gerekir — baştan reddetmek ile kabul edip
tamamlayamamak farklı şeylerdir.

## Çözüm

Kabul tarafına iki yeni ara/terminal durum ekleyip `accepted`'ı terminal
olmaktan çıkarıyoruz. Tüm ilerletmeyi yalnız **admin** yapar; talep eden sadece
durumu görür. Mevcut "separation of duties" kuralı (admin kendi talebinde işlem
yapamaz) aynen geçerlidir.

### Durum Makinesi (8 durum)

Kod/DB'de İngilizce slug, UI'da Türkçe label:

| slug | label | terminal |
|---|---|---|
| `new` | Yeni | — |
| `clarifying` | Netleştiriliyor | — |
| `answered` | Cevaplandı | — |
| `accepted` | Kabul edildi | — |
| `in_progress` | Yapılıyor | — |
| `done` | Tamamlandı | ✅ |
| `rejected` | Reddedildi | ✅ |
| `cancelled` | İptal edildi | ✅ |

### Geçişler

- `new` → `clarifying` | `accepted` | `rejected`
- `clarifying` → `answered` | `accepted` | `rejected`
- `answered` → `clarifying` | `accepted` | `rejected`
- `accepted` → `in_progress` | `done` | `cancelled`
- `in_progress` → `done` | `cancelled`
- `done` / `rejected` / `cancelled` → **çıkış yok** (terminal)

Notlar:
- `accepted → done` doğrudan geçişe izin verilir (ör. talep edilen şey zaten
  mevcuttu; admin not yazıp tamamlandı işaretler).
- `cancelled` "kabul edildi ama tamamlanamadı/vazgeçildi" anlamındadır;
  `accepted` ve `in_progress`'ten erişilir, baştan reddetmeden (`rejected`)
  anlamca ayrıdır.

### Gerekçe zorunluluğu

- `rejected` ve `cancelled` → gerekçe **zorunlu** (kullanıcıya mailde gösterilir).
- `accepted`, `in_progress`, `done` → gerekçe/not **isteğe bağlı**.

### Mail bildirimi (best-effort, akışı bloklamaz)

| hedef durum | talep edene mail |
|---|---|
| `accepted` | ✅ |
| `rejected` | ✅ |
| `done` | ✅ |
| `cancelled` | ✅ |
| `in_progress` | ❌ (gürültüyü azaltmak için) |

## Mimari / Etkilenen Bileşenler

### 1. `src/domain/status.ts` (SSoT)

- `RequestStatus` union'a `in_progress`, `done`, `cancelled` eklenir.
- `TERMINAL = { done, rejected, cancelled }`.
- `ALLOWED` haritası yukarıdaki geçiş tablosuna göre güncellenir.
- `LABELS_TR`'ye üç yeni label eklenir (Yapılıyor / Tamamlandı / İptal edildi).

`canTransition` ve `isTerminal` imzaları değişmez — yalnız veri güncellenir.

### 2. `src/domain/validation.ts`

`decisionSchema` genişletilir; tek endpoint/tek şema korunur:

- `decision ∈ { accept, reject, start, complete, cancel }`
- Eşleme: `accept→accepted`, `reject→rejected`, `start→in_progress`,
  `complete→done`, `cancel→cancelled`.
- `reason` **zorunlu**: `reject` ve `cancel` için. Diğerlerinde isteğe bağlı.

Geçiş legalliği `canTransition` ile route'ta zorlanır (illegal → 409); repo
sınırı (`addMessageAndTransition`) yine illegal geçişte throw eder. Yani şema
yalnız "bu karar değeri geçerli mi + gerekçe var mı" sorularını yanıtlar;
"bu durumdan bu hedefe geçilebilir mi" sorusunu FSM yanıtlar.

### 3. `src/server/routes/admin.ts`

`POST /api/admin/requests/:id/decision` handler'ı:

- Yeni karar değerlerini hedef duruma eşler (yukarıdaki tablo).
- `canTransition(r.status, target)` değilse 409 ("Bu talep zaten kapalı" /
  uygun mesaj).
- `addMessageAndTransition` ile atomik geçiş (gerekçe varsa admin mesajı olarak).
- Mail: hedef `in_progress` ise mail gönderilmez; aksi halde `decisionRequester`
  ile bildirim.

Yeni endpoint **eklenmez** — mevcut `/decision` tüm durum değişikliklerini
karşılar. Auth gate, admin kontrolü, CSRF, id-NaN guard ve self-request yasağı
değişmez.

### 4. `src/mail/templates.ts`

`decisionRequester` hedef tipi `"accepted" | "rejected" | "done" | "cancelled"`
olacak şekilde genişletilir:

- label eşlemesi: accepted→"kabul edildi", rejected→"reddedildi",
  done→"tamamlandı", cancelled→"iptal edildi".
- Konu ve gövde mevcut şablonu kullanır; yalnız label değişir. Gerekçe (varsa)
  bugünkü gibi "Not:" olarak eklenir.

### 5. `src/client/components/AdminControls.tsx`

Duruma göre kontrol seti render edilir:

- **Karar öncesi** (`new`/`clarifying`/`answered`): bugünkü davranış —
  Netleştirme sorusu formu + **Kabul et / Reddet** (reddet onay dialogu, gerekçe).
- **`accepted`**: **Geliştirmeye başla** (start) · **Tamamlandı** (complete) ·
  **İptal et** (cancel — gerekçe dialogu, reddet gibi).
- **`in_progress`**: **Tamamlandı** (complete) · **İptal et** (cancel).
- **terminal** (`done`/`rejected`/`cancelled`): "Bu talep kapalı."

Netleştirme formu yalnız karar-öncesi durumlarda gösterilir (kabul sonrası
netleştirme akışı yok). `decide()` yardımcı fonksiyonu yeni karar değerlerini
(`start`/`complete`/`cancel`) de gönderebilecek şekilde genelleştirilir.

### 6. `src/client/components/StatusBadge.tsx`

`TINT` haritasına `in_progress`, `done`, `cancelled` eklenir. Renk eşleştirmesi:

- `in_progress` → mavi/ilerleme tonu (ör. `status-netlestiriliyor` token'ı yeniden
  kullanılabilir veya yeni `status-yapiliyor` token'ı).
- `done` → yeşil (kabul tonu / yeni `status-tamam`).
- `cancelled` → nötr/gri veya kırmızımsı (yeni `status-iptal`).

Gerekirse Tailwind/CSS token'ları eklenir; tercihen ayırt edilebilir renkler.

### 7. `src/domain/stats.ts`

`buildDashboardStats` içindeki `byStatus` literal'ine üç yeni durum eklenir
(aksi halde `r.status in byStatus` kontrolü onları saymaz). `open` hesabı
(`new + clarifying + answered`) ve `isTerminal` tabanlı aged/priority mantığı
aynı kalır — yeni terminal durumlar `isTerminal` üzerinden otomatik dışlanır.

## Test

TDD: önce başarısız test → minimal kod → yeşil.

- **`status.test.ts`** — exhaustive: 8 durum × geçiş matrisi (legal/illegal),
  `isTerminal` üç terminal için, label eşlemeleri.
- **`admin.test.ts`** — `/decision` için yeni karar değerleri: start/complete/
  cancel happy-path (204 + durum); illegal geçiş 409; cancel'da gerekçe
  zorunluluğu 400; mail'in `in_progress`'te gönderilmediği / diğerlerinde
  gönderildiği (mock mailer çağrı kontrolü); self-request 403 korunur.
- **`stats.test.ts`** — yeni durumların `byStatus`'ta sayıldığı; terminal
  durumların `open`/aged dışında kaldığı.
- **`templates.test.ts`** — `decisionRequester` done/cancelled label + gerekçe.
- **`StatusBadge.test.tsx`** — yeni durumların doğru label/tint render'ı.
- **`repo.test.ts`** — `addMessageAndTransition` yeni legal geçişler + illegal'de
  throw.

## Kapsam Dışı (YAGNI)

- `cancelled`/`done`'dan geri dönüş veya yeniden açma.
- `accepted` sonrası netleştirme turu.
- GitHub issue dönüştürme (mevcut Faz D kapsamı, ayrı tasarım).
