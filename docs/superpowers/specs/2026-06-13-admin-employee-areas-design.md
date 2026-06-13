# Çalışan / Yönetim Alan Ayrımı — Tasarım

- **Tarih:** 2026-06-13
- **Durum:** Onaylandı (brainstorm)
- **Bağlam:** Bun.serve + React SPA portalı.

## 1. Problem

Admin ile normal kullanıcı **aynı sayfaları ve aynı ana akışı** paylaşıyor: admin
giriş yapınca da ana sayfa "Yeni Talep" oluyor, navigasyon karışık. Dahası, talep
detayında kontroller `isAdmin`'e göre belirlendiği için **admin kendi talebine cevap
veremiyor** (admin bir netleştirme sorusu sorduğunda kimse cevaplayamıyor — tek hesap
senaryosunda tıkanıyor). Bu mantık dışı.

## 2. Karar (brainstorm)

İki capability korunur ama **iki net alan** olur (tek uygulama):
- **Çalışan alanı:** Yeni Talep, Taleplerim, talep detayında cevaplama.
- **Yönetim alanı (yalnız admin):** Tüm Talepler, Tanımlar, başkalarının taleplerinde
  netleştirme/karar.

Talep detayındaki kontroller artık **`isAdmin` bayrağına değil, kullanıcının talebe
ilişkisine** göre belirlenir.

## 3. Davranış

### 3.1 Rotalar ve giriş sonrası iniş (landing)
- `/` artık **rol-bazlı yönlendirici** (kendi içeriği yok): admin → `/admin`, çalışan → `/my`.
- **Yeni Talep formu `/yeni`'ye taşınır** (eskiden `/`). Her iki role de açık; nav'dan erişilir.
- Admin → `/admin` (Yönetim paneli — Tüm Talepler); çalışan → `/my` (Taleplerim).

### 3.2 Navigasyon (gruplu)
- Çalışan: `Taleplerim` · `Yeni Talep`.
- Admin: bunlara ek, görsel olarak ayrılmış **Yönetim** grubu: `Tüm Talepler` · `Tanımlar`.
- Marka logosu tıklanınca role uygun ana alana gider (admin→/admin, çalışan→/my).

### 3.3 Talep detayı — ilişkiye göre kontroller (asıl düzeltme)
Verilen `user` ve `request` için:
- **Kullanıcı talebin sahibiyse** (`user.email === request.requester_email`,
  case-insensitive) → durum `clarifying` iken **"Cevapla"** formu. Admin de olsa kendi
  talebine cevap verebilir.
- **Kullanıcı admin VE talep başkasınınsa** → **netleştirme** (Soru ekle) +
  **karar** (Kabul/Ret) kontrolleri.
- **Kendi talebinde admin karar/netleştirme kontrolü YOK** — kendi talebini kendin
  karara bağlayamazsın (görev ayrımı / separation of duties).

Özet matris:
| Kullanıcı | Talep sahibi mi | Görür |
|---|---|---|
| Çalışan | evet | Cevapla (clarifying iken) |
| Çalışan | hayır | (zaten erişemez — 404) |
| Admin | evet (kendi talebi) | Cevapla (clarifying iken); karar/soru YOK |
| Admin | hayır (başkasının) | Soru ekle + Kabul/Ret |

## 4. Backend Değişikliği

### 4.1 `src/domain/authz.ts` — `canReply`
Mevcut: `if (user.isAdmin) return false; ... return req.status === "clarifying"`.
Yeni: `isAdmin` dışlaması **kaldırılır**:
```ts
export function canReply(user: User, req: RequestRef): boolean {
  if (user.email.toLowerCase() !== req.requester_email.toLowerCase()) return false;
  return req.status === "clarifying";
}
```
(`canViewRequest` değişmez: sahip VEYA admin görebilir.)

### 4.2 Görev ayrımı — admin kendi talebinde karar/soru veremez
`src/server/routes/admin.ts` `message` ve `decision` handler'larında: hedef talebin
`requester_email`'i çağıran admin'in email'iyle aynıysa → **403** ("Kendi talebinizde
yönetici işlemi yapamazsınız"). Bu, hem UI gizlese de backend'de zorlanan invariant.

`canReply` artık owner-admin'e izin verdiği için reply route'u (`/api/requests/:id/reply`)
admin-owner için de çalışır — ek değişiklik gerekmez (route zaten `canReply`'a bakıyor).

## 5. Frontend Değişikliği

- **`src/client/app.tsx` rotalar:** `/` → rol-bazlı yönlendirici bileşeni
  (`useUser().isAdmin ? <Navigate to="/admin"/> : <Navigate to="/my"/>`). Yeni Talep
  formu (`NewRequest`) `/yeni` rotasına taşınır. `/my`, `/admin`, `/admin/tanimlar`,
  `/requests/:id`, `/login` aynı kalır. Sunucu (`src/index.ts`) SPA shell'i bu yeni
  navigasyon rotaları için de servis etmeli — Bun.serve `routes` listesine `/yeni`
  eklenir (mevcut `/`, `/my`, `/admin`, `/requests/:id` gibi).
- **`src/client/app.tsx` nav:** gruplu navigasyon (Çalışan grubu + admin için Yönetim
  grubu, görsel ayraçla). Marka linki role göre hedeflenir.
- **`src/client/pages/RequestDetail.tsx`:** kontrol seçimi `isAdmin` yerine ilişkiye
  göre:
  - `isOwner = user.email.toLowerCase() === request.requester_email.toLowerCase()`.
  - `isOwner && status==="clarifying"` → Cevapla formu.
  - `user.isAdmin && !isOwner` → AdminControls (Soru ekle + karar).
  - Diğer hallerde salt-okunur thread.
- **`src/client/components/AdminControls.tsx`:** yalnız `user.isAdmin && !isOwner` iken
  render edilir (RequestDetail bunu geçirir).
- **İç linkler:** "Yeni talep" linkleri (`MyList` başlık butonu + boş-durum linki, ve
  varsa diğerleri) `/` yerine `/yeni`'yi gösterecek şekilde güncellenir. `NewRequest`'in
  başarıdaki `navigate('/requests/:id')` davranışı değişmez.

## 6. Test

- **`src/domain/authz.test.ts`:** yeni `canReply` matrisi — owner çalışan clarifying→true;
  owner admin clarifying→true (YENİ davranış); admin başkasının talebinde→false;
  owner ama answered/terminal→false.
- **`src/server/routes/admin.test.ts`:** admin kendi talebinde `message`→403; kendi
  talebinde `decision`→403; başkasının talebinde her ikisi de çalışır (mevcut testler).
- **`src/server/routes/requests.test.ts`:** admin-owner kendi talebine `reply`→204
  (clarifying iken); answered/terminal iken→403.
- **Frontend:** `bun run build` gate; görsel doğrulama (admin landing=/admin; admin
  kendi talebinde Cevapla görür, karar görmez; admin başkasının talebinde karar görür).

## 7. Kapsam Dışı (YAGNI)

- Ayrı iki uygulama / subdomain / rol-bazlı tema.
- "Çalışan görünümüne geç" toggle'ı (gruplu nav yeterli).
- Çoklu admin onay akışı / ikinci onaycı.

## 8. Riskler

- **`canReply` semantiği değişiyor** → mevcut testler güncellenmeli; "admin asla
  cevaplayamaz" varsayımına dayanan testler kırılır (beklenen, güncellenir).
- **Route path değişimi** (`/` → yönlendirici, `/yeni` → form): SPA içi link'ler ve
  landing mantığı tutarlı güncellenmeli.
