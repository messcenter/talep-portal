# Yeni Talep Formu — Görsel Cila (Design)

**Tarih:** 2026-06-13
**Kapsam:** `src/client/pages/NewRequest.tsx` görsel cilası + sürükle-bırak ek alanı.
**Görsel yön:** "Rafine Kurumsal" (mevcut tasarım dili korunur, sadece cilalanır).

## Amaç

Yeni Talep formu işlevsel ama tüm alanlar tek bir düz kartta eşit ağırlıkta alt
alta dizili — gruplama yok, "alanlar duvarı" hissi veriyor. Aynı alanları, aynı
kurumsal stili koruyarak; bölümlenmiş, nefes alan bir forma dönüştürmek.

**Değişmeyen:** alanlar, alan adları (`newRequestSchema` ile birebir), gönderim
akışı, doğrulama kuralları, durum/yönlendirme. Bu salt görsel + tek küçük etkileşim
(drag & drop) eklemesidir.

## Tasarım

### 1. Bölümleme (tek `Card` içinde)

Alanlar üç mantıksal gruba ayrılır. Her grubun başında küçük büyük-harf başlık
(primary renk, `text-xs font-semibold uppercase tracking-wide text-primary`) ve
gruplar arası ince ayraç (`border-t border-border-subtle`).

| Bölüm | Alanlar |
|---|---|
| **Kapsam** | Departman, Uygulama, Modül/Alan (departmana bağlı, koşullu) |
| **Sınıflandırma** | Talep Türü, Öncelik |
| **Talep Detayı** | Başlık, Açıklama, Beklenen Fayda, Ekler |

Mevcut iki-sütun grid'ler (Departman+Uygulama, Tür+Öncelik) ilgili bölümler içinde
korunur. Modül/Alan koşullu render'ı (`selectedDept`) aynen kalır, "Kapsam"
bölümünde yer alır.

### 2. Ritim & boşluk

- Bölümler arası tutarlı dikey ritim; bölüm başlığı ↔ alanlar ↔ sonraki bölüm
  arası nefes.
- Sayfa başlık bloğu (`h1` + açıklama) ile kart arası boşluk korunur/biraz artar.
- Kart iç dolgusu biraz artar (`p-6` → form bölümleri arası `space-y` ritmi).
- Input *stili* değişmez (yükseklik, focus ring, renk aynı) → diğer formlara sızma yok.

### 3. Ekler — sürükle-bırak alanı

Çıplak `file:` input yerine, ince kesikli çerçeveli bir bırakma alanı (drop zone):

- **Görünüm:** `border-2 border-dashed border-border-subtle rounded-lg`, ortalanmış
  ikon + "Dosyaları buraya sürükleyin veya **seçin**" metni + alt satırda izinli
  tipler (`PNG, JPEG, WebP, GIF, PDF`).
- **Tıklama:** alana tıklayınca gizli native `<input type="file" multiple>` açılır.
- **Sürükle-bırak:** `onDragOver`/`onDragLeave`/`onDrop` ile; sürükleme sırasında
  alan vurgulanır (`border-primary bg-surface-tonal`). Bırakılan dosyalar
  `DataTransfer` üzerinden native input'un `files` özelliğine yazılır → mevcut
  `FormData(formRef.current)` gönderimi **değişmeden** çalışır.
- **Seçilen dosyalar:** alanın altında dosya adı + boyut listesi; her satırda
  kaldır (×) düğmesi. Kaldırma, kalan dosyalardan yeni bir `DataTransfer`/`FileList`
  kurar.
- **Erişilebilirlik:** alan klavyeyle odaklanır ve Enter/Space ile input'u tetikler;
  drop alanı `aria-label`'lı.

`accept` listesi `forms.ts`'teki `fileAccept` sabitinden gelir.

### 4. Kod temizliği (kapsam içi, küçük)

`NewRequest.tsx` kendi yerel `inputClass` kopyasını tutuyor; bu zaten `forms.ts`'te
mevcut. Yerel kopya silinir, `forms.ts`'ten import edilir (DRY). Stil aynı kaldığı
için görsel değişiklik yok.

Drop zone, sayfa içinde küçük bir alt-bileşen olarak (`FileDropField`) ya da
yeniden kullanılabilirse `src/client/components/` altında ayrı dosya olarak ele
alınır — tek sorumluluğu dosya seçimi/önizleme; dışa `name` + `disabled` prop'ları
ile konuşur, başka I/O yapmaz.

## Kapsam dışı (bilinçli)

- Alan ekleme/çıkarma, satır-içi (inline) alan doğrulama davranışı.
- İki/çok sütun form layout'u.
- Admin ve diğer ekranların cilası.
- `forms.ts` paylaşılan input stilinin değişmesi (ripple riskini önlemek için).

## Test & doğrulama

- Davranış değişmediği (alan adları, gönderim, doğrulama aynı) için mevcut testler
  yeşil kalmalı.
- Drop zone bir davranış eklediğinden, dosya seçiminin `FormData`'ya doğru
  yansıdığını doğrulayan bir bileşen/etkileşim testi eklenir (jsdom altında
  `DataTransfer` ile drop simülasyonu; mümkün değilse en azından "seç" akışı ve
  seçilen dosyaların listelenip kaldırılması test edilir).
- Görsel cila (bölümleme, boşluk) için ayrı test yazılmaz.
- `bun test` yeşil olmadan commit yok.
