# Mail Şablonu Görsel Cilası — Tasarım

**Tarih:** 2026-06-17
**Durum:** Onaylandı (uygulama bekliyor)

## Problem

Mevcut bildirim mailleri (`src/mail/templates.ts`) işlevsel ama görsel olarak
çıplak: markalı bir başlık + tek cümle gövde + tek buton. Talebin durumu, önceliği
ve bağlamı (departman/uygulama) mailde görünmüyor; gelen kutusunda önizleme metni
yok. Alıcı, talebin ne olduğunu/hangi durumda olduğunu ancak tıklayıp gir
yaptıktan sonra anlıyor.

## Çözüm

5 bildirim mailinin tümünü ortak `emailLayout` üzerinden görsel olarak cilala.
**İçerik/metin korunur**; yalnız görünüm + bağlam zenginleşir. Şablon imzaları
değişmez — hepsi zaten tam `RequestRow` alıyor (departman, uygulama, öncelik,
başlık, request_no, request_type hazır).

### Eklenen görsel öğeler (ortak `emailLayout`)

1. **Header** — "Talep Portalı" wordmark + alt satır **"Kokil Metal"** (şirket adı);
   ince tipografi/boşluk.
2. **Preheader** — gizli (`display:none;max-height:0;overflow:hidden`) gelen-kutusu
   önizleme metni; mail başına kısa özet.
3. **Durum rozeti (pill)** — duruma göre renkli; **uygulamadaki status
   token'larıyla aynı renkler** (tutarlılık):

   | durum | label | metin rengi | açık zemin |
   |---|---|---|---|
   | new | Yeni | #1976D2 | #e8f1fb |
   | clarifying | Netleştiriliyor | #F57C00 | #fef0e0 |
   | answered | Cevaplandı | #F57C00 | #fef0e0 |
   | accepted | Kabul edildi | #2E7D32 | #e7f1e8 |
   | done | Tamamlandı | #00897B | #e0f2f0 |
   | rejected | Reddedildi | #C62828 | #fbe9e9 |
   | cancelled | İptal edildi | #607D8B | #eceff1 |

4. **Talep no + başlık** — `request_no` kalın, altında `title`.
5. **Bağlam etiketleri** — `department` · `application` (nötr gri) + **öncelik**
   rozeti (renkli): Yüksek #C62828/#fbe9e9 (kalın), Orta #F57C00/#fef0e0, Düşük
   #42474f/#eef1f5.
6. **CTA** — "→" oklu, `border-radius:6px` yumuşatılmış buton.
7. **Footer** — `baseUrl`'den türetilen host (`new URL(baseUrl).host`): dev'de
   `localhost:3120`, prod'da `talep.mess.center`.

### Her mail hangi durumu gösterir (pill kaynağı)

| şablon | pill durumu |
|---|---|
| `newRequestAdmin` | new |
| `newRequestRequester` | new |
| `questionRequester` | clarifying |
| `replyAdmin` | answered |
| `decisionRequester` | `target` (accepted/rejected/done/cancelled) |

Pill durumu mail türüne göre **sabit** geçilir (decisionRequester'da mevcut
`target` parametresi kullanılır); `r.status` alanına bağlı değildir (gönderim
anında satırın durumu güvenilir olmayabilir).

## Mimari / Bileşenler

Tek dosya (`src/mail/templates.ts`) içinde, `emailLayout` büyüyeceği için küçük
**saf yardımcılar** ayrılır:

1. **`STATUS_PILL: Record<RequestStatus, { label: string; fg: string; bg: string }>`**
   — durum → label + renkler. `label` değerleri `statusLabelTr` ile aynı metinler
   (DRY için doğrudan import edilebilir; renkler maile özgü olduğundan burada
   tanımlanır). `in_progress` için de giriş bulunur (mailde kullanılmaz ama
   `Record` exhaustive olmalı — 8 durum).
2. **`priorityBadge(priority: string): { text: string; fg: string; bg: string; bold: boolean }`**
   — `high→"Yüksek öncelik"`, `medium→"Orta öncelik"`, `low→"Düşük öncelik"`;
   bilinmeyen değer nötr gri ile gösterilir.
3. **`emailLayout`** genişletilir; yeni opts:
   ```
   {
     preheader: string,
     pillStatus: RequestStatus,   // STATUS_PILL[pillStatus] ile pill render
     requestNo: string,
     title?: string,
     department: string,
     application: string,
     priority: string,
     bodyHtml: string,
     ctaText: string,
     ctaUrl: string,
   }
   ```
   `heading` parametresi kaldırılır — başlık artık `requestNo` + `title` +
   durum rozeti kombinasyonu. Her şablon `bodyHtml`'i (mevcut cümle) + kendi
   preheader/pill/CTA değerlerini geçer.

5 şablon fonksiyonu (`newRequestAdmin`, `newRequestRequester`, `replyAdmin`,
`questionRequester`, `decisionRequester`) imzaları **aynı kalır**; içlerinde
genişletilmiş `emailLayout`'a yeni alanları (RequestRow'dan) geçirir.

### Güvenlik (mevcut sözleşme korunur)

`department`, `application`, `title`, `reason` kullanıcı girdisidir → rozet/başlık/
gövdede **`esc()`** ile kaçırılır. `request_no`, label'lar, renk sabitleri
güvenli. Preheader'a giren kullanıcı metni de `esc()`'lenir.

## Test (`src/mail/templates.test.ts`)

Mevcut konu (subject) ve `esc()` testleri **korunur**. Eklenenler:

- Her mailde doğru **pill etiketi** render edilir (örn. `decisionRequester`
  accepted → "Kabul edildi"; `questionRequester` → "Netleştiriliyor";
  `newRequestRequester` → "Yeni").
- Her mailde **preheader** metni mevcut.
- **Bağlam etiketleri**: `department`/`application` metni gövdede var ve
  `esc()`'lenmiş (HTML metakarakter içeren departman adıyla test).
- **Öncelik etiketi** eşlemesi: high→"Yüksek öncelik", medium→"Orta", low→"Düşük".
- **Footer host** `baseUrl`'den türer (`https://x.test/...` → "x.test" içerir).
- `priorityBadge` ve `STATUS_PILL` saf yardımcıları için doğrudan birim testleri.

## Kapsam Dışı (YAGNI)

- Gerçek mesaj metnini (soru/cevap tam metni) gövdeye koymak — bu "bilgilendirici"
  yön; ayrı bir iş.
- Logo görseli (e-posta istemcileri sık bloklar; wordmark daha sağlam).
- Dark-mode'a özel stiller / medya sorguları.
- `in_progress` için mail (yaşam döngüsü tasarımında bilinçli sessiz).
