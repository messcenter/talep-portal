# Markalı Mail Şablonları — Tasarım

- **Tarih:** 2026-06-13
- **Durum:** Onaylandı (brainstorm)
- **Bağlam:** Bun.serve + React SPA portalı; bildirim mailleri nodemailer (Zoho SMTP) ile.

## 1. Problem

Bildirim mailleri route handler'larında gömülü çıplak `<p>` HTML'leri — markasız,
tutarsız, bakımı route'a yayılmış. 5 bildirim tipi var. Markalı, tutarlı, tek yerde
toplanan şablonlar isteniyor.

## 2. Karar (brainstorm)

Markalı ortak HTML layout (inline CSS, e-posta uyumlu) + düz-metin (text) fallback.
Tüm şablonlar `src/mail/templates.ts`'te saf fonksiyonlar olarak toplanır. Mailer
`text` parametresi alacak şekilde genişler.

## 3. Mimari

### 3.1 `src/mail/templates.ts` (yeni, saf — I/O yok)
- **`emailLayout({ heading, bodyHtml, ctaText, ctaUrl }): string`** — e-posta-uyumlu
  inline-CSS HTML üretir:
  - ~600px ortalı tablo/kapsayıcı; üst şerit `#0F4C81` zemin + beyaz "Talep Portalı"
    başlığı; beyaz kart gövde (`heading` + `bodyHtml`); primary renkli **CTA buton**
    (`ctaText` → `ctaUrl`); alt bilgi (muted) "Bu e-posta Talep Portalı tarafından
    otomatik gönderildi."
  - Font: `Arial, Helvetica, sans-serif` (Inter e-postada güvenilmez). Renkler inline.
  - `ctaText`/`ctaUrl` opsiyonel — buton yoksa atlanır.
- **`esc(s)`** — HTML kaçışı. **Karar:** `templates.ts` kendi küçük `esc`'ini barındırır
  (4 satır), `src/mail/`'a `src/server/`'dan bağımlılık eklememek için. `src/server/escape.ts`
  ile küçük tekrar — kabul edilen katman takası.

### 3.2 Beş şablon fonksiyonu
Her biri `(r: RequestRow, baseUrl: string, ...extra) → { subject: string; html: string; text: string }`.
URL'ler `baseUrl` + path ile kurulur; user metni `esc`'lenir.

| Fonksiyon | subject | CTA | URL |
|---|---|---|---|
| `newRequestAdmin(r, base)` | `Yeni talep: {request_no}` | İncele | `{base}/admin/requests/{id}` |
| `newRequestRequester(r, base)` | `Talebiniz alındı: {request_no}` | Talebi görüntüle | `{base}/requests/{id}` |
| `replyAdmin(r, base)` | `Cevaplandı: {request_no}` | İncele | `{base}/admin/requests/{id}` |
| `questionRequester(r, base)` | `Talebiniz hakkında soru: {request_no}` | Cevapla | `{base}/requests/{id}` |
| `decisionRequester(r, base, target, reason?)` | `Talep {kabul edildi\|reddedildi}: {request_no}` | Talebi görüntüle | `{base}/requests/{id}` |

Gövde içerikleri (örnek):
- newRequestAdmin: "{request_no} — {esc(title)} adlı yeni bir talep oluşturuldu."
- newRequestRequester: "Talebiniz alındı. Süreci buradan takip edebilirsiniz."
- replyAdmin: "{request_no} talebine cevap verildi."
- questionRequester: "Talebinizle ilgili netleştirme soruları var. Lütfen cevaplayın."
- decisionRequester: "{request_no} talebiniz {kabul edildi/reddedildi}." + reason varsa
  ayrı paragraf "Not: {esc(reason)}".
- `text` sürümü: aynı bilgiler düz metin + URL satırı.

`RequestRow` tipi `src/db/repo.ts`'ten import edilir (zaten orada). `target` =
`"accepted" | "rejected"`.

### 3.3 Mailer genişletmesi (`src/mail/mailer.ts`)
- `Transport.sendMail` mesajına opsiyonel `text?: string` eklenir.
- `send(to, subject, html, text?)` — `text` verilirse nodemailer'a geçirilir.
- Geriye uyumlu: mevcut 3-arg çağrılar çalışmaya devam eder.

### 3.4 Route entegrasyonu (`src/server/routes/requests.ts`, `admin.ts`)
Gömülü HTML + subject liter'leri kaldırılır; yerine şablon çağrısı:
```ts
const t = newRequestAdmin(r, deps.config.appBaseUrl);
deps.mailer.send(admin, t.subject, t.html, t.text).catch(() => {});
```
Tüm 5 mail çağrısı (newRequest→admin, newRequest→requester, reply→admin,
adminMessage→requester, decision→requester) şablonlara çevrilir. Best-effort
(`.catch(()=>{})`) ve `for (const admin of adminEmails)` döngüsü korunur. Subject
artık şablondan; route'taki ayrı subject string'i kalkar.

## 4. Test
- **`src/mail/templates.test.ts`** (yeni, exhaustive): her fonksiyon için
  - `subject` doğru (request_no içerir, karar için kabul/ret).
  - `html` CTA URL'sini (doğru path) ve kaçırılmış başlığı içerir.
  - `text` anahtar bilgiyi + URL'yi içerir.
  - **XSS:** `title`/`reason` içine `<script>` → html'de `&lt;script&gt;` (kaçırılmış).
  - decisionRequester: reason varsa gövdede, yoksa "Not:" bloğu yok.
- **`src/mail/mailer.test.ts`** (mevcut): `text` parametresi nodemailer mesajına
  geçiyor mu (mock transport ile) — bir test eklenir; mevcut testler yeşil kalır.
- **Route testleri:** mock mailer `send`'i fazladan `text` arg'ını yok sayar (JS);
  yeşil kalır. İstenirse bir route testinde gönderilen subject'in şablondan geldiği
  doğrulanır (opsiyonel).
- **Gate:** `bun test` yeşil (192+).

## 5. Kapsam Dışı (YAGNI)
- Logo görseli / MJML / e-posta açılma takibi / çoklu dil.
- Kullanıcı tarafından düzenlenebilir şablonlar (admin UI).
- Dijital imza/DKIM (altyapı).

## 6. Riskler
- **E-posta istemci uyumu:** inline CSS + tablo/güvenli yapı kullanılır; modern CSS'ten
  kaçınılır. Görsel test gerçek istemcide manuel; birim test HTML içeriğini doğrular.
- **esc tekrarı:** `templates.ts` kendi küçük `esc`'ini barındırır (katman temizliği);
  `src/server/escape.ts` ile küçük bir tekrar — kabul edilen takas.
