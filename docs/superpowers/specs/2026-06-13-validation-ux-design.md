# Doğrulama UX'i (Türkçe, alan-bazı) — Tasarım

- **Tarih:** 2026-06-13
- **Durum:** Onaylandı (teşhis sonrası)
- **Bağlam:** Teşhis: form dolu gönderilince çalışıyor (regresyon yok). Sorun, zorunlu
  alanlar boşken **ham İngilizce** zod hatalarının ("String must contain at least 1
  character(s)", "Invalid enum value... received ''") tek blokta gösterilmesi + istemci
  tarafı rehberlik olmaması (`noValidate`).

## 1. Amaç
Doğrulama hatalarını **Türkçe ve alan-bazlı** yapmak: kullanıcı boş zorunlu alanla
gönderince anlaşılır Türkçe geri bildirim alsın; mümkünse sunucuya gitmeden, alanın
altında.

## 2. Parçalar

### A. Türkçe zod mesajları — `src/domain/validation.ts`
Her alana Türkçe `message` eklenir (sunucudan dönen hatalar da Türkçe olur — defense):
- `department`: boş → "Departman gerekli"; max → "Departman en fazla 120 karakter"
- `application`: "Uygulama gerekli" / max
- `module_area`: max → "Modül/alan en fazla 120 karakter"
- `request_type`: enum → "Talep türü seçiniz"
- `title`: "Başlık gerekli" / max "Başlık en fazla 200 karakter"
- `description`: "Açıklama gerekli" / max "Açıklama en fazla 5000 karakter"
- `expected_benefit`: "Beklenen fayda gerekli" / max "Beklenen fayda en fazla 2000 karakter"
- `priority`: enum → "Öncelik seçiniz"
- `replySchema.body`/`messageSchema.body`: "Mesaj gerekli" / max "En fazla 5000 karakter"
- `decisionSchema.reason`: max "Gerekçe en fazla 2000 karakter"; refine → "Ret için gerekçe gerekli"
Zod v3 API: `z.string().trim().min(1, "…").max(n, "…")`; enum: `z.enum([...], { errorMap: () => ({ message: "…" }) })` veya `z.enum([...], { message: "…" })` (kurulan zod sürümüne göre — plan doğrular).

### B. İstemci hata gösterimi temizliği (tüm formlar)
Formlar sunucudan `{errors: string[]}` alıp tek banner'da gösteriyor; mesajlar artık
Türkçe (A) → banner'da ham `path: mesaj` yerine **düz Türkçe liste** gösterilir
(route halen `path: message` birleştiriyorsa, ya route sadece `message`'ı döndürür ya da
istemci `path:` önekini ayıklar). **Karar:** sunucu route'u `{errors}` üretirken zaten
`i.message` veriyor; `path` önekini kaldır (yalnız Türkçe mesaj). (requests.ts/admin.ts
hata map'i: `issues.map(i => i.message)`.)

### C. İstemci-tarafı zorunlu kontrol + alan-bazı Türkçe (form bazında)
Gönderimden ÖNCE zorunlu alanlar istemcide kontrol edilir; boşsa **POST edilmez**, ilgili
alanın altında Türkçe hata + alan vurgusu (`aria-invalid`), ilk hatalı alana odak/scroll.
- **NewRequest:** department, request_type, priority, title, description, expected_benefit
  zorunlu (module_area opsiyonel; application varsayılan "ERP"). Her biri için boş kontrolü
  → `{ field: mesaj }` state; alan altında göster.
- **ReplyForm:** body boşsa → "Cevap gerekli", POST etme.
- **AdminControls message:** body boşsa → "Soru gerekli".
- **AdminControls reject:** reason boşsa → "Ret gerekçesi gerekli" (zaten Dialog'da; submit engelle).
- Sunucu hatası yine de gelirse (yarış/defense) B'deki Türkçe banner gösterir.

## 3. Kapsam
- A + B + C birlikte: A/B küçük ve tüm formlara yarar; C asıl rehberliği verir.
- TipTap içerik boşluğu kontrolü: `description`/`expected_benefit` değeri (markdown)
  trim'lenince boşsa "gerekli". (Editör boşken `getMarkdown()` "" döner.)

## 4. Test
- **`src/domain/validation.test.ts`:** birkaç alanın Türkçe mesaj döndürdüğünü doğrula
  (örn. boş department → "Departman gerekli"; reject reason yok → "Ret için gerekçe gerekli";
  başlık > 200 → "Başlık en fazla 200 karakter"). Mevcut parse-başarı testleri korunur.
- **Frontend:** build gate; görsel smoke — NewRequest boş gönder → alan altı Türkçe
  hatalar, POST gitmez; dolu gönder → başarı. Reply/message/reject boş → Türkçe uyarı.
- Backend davranışı (status kodları) değişmez; yalnız mesaj metni Türkçeleşir.

## 5. Kapsam Dışı (YAGNI)
- Karakter sayacı (ayrı bir iyileştirme).
- Tüm alanlar için canlı (onChange) doğrulama — yalnız submit'te + (opsiyonel) blur.
- i18n altyapısı (mesajlar doğrudan Türkçe string).

## 6. Riskler
- **zod enum mesaj API'si** sürüme bağlı (v3.23) — plan ilk adımı doğru imzayı doğrular.
- **C'nin form başına tekrarı:** ortak bir küçük yardımcı (`requiredError(value, msg)`) ile
  DRY tutulur; ama her formun alanları farklı olduğundan kontrol formda yazılır.
- Route hata map değişimi (`path` kaldırma) mevcut bir testi kırarsa Türkçe-only'e güncellenir.
