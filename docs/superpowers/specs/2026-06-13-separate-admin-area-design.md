# Ayrı Admin Alanı (Komple Ayrı Endpoint) — Tasarım

- **Tarih:** 2026-06-13
- **Durum:** Onaylandı (brainstorm)
- **Bağlam:** Bun.serve + React SPA portalı. Önceki "gruplu nav" yaklaşımı yetersiz
  bulundu; admin tarafı **kendi alanı + kendi sayfaları** olarak ayrılacak.

## 1. Problem

Admin ve çalışan tek layout + gruplu nav ile aynı uygulamada karışıktı. Talep detayı
tek sayfaydı ve role göre dallanıyordu (kafa karıştırıcı). Kullanıcı admin'i **komple
ayrı bir alan/endpoint** olarak istiyor.

## 2. Karar (brainstorm)

Tek SPA / tek bundle / tek auth korunur, ama frontend **iki ayrı alana** bölünür:
ayrı layout'lar, ayrı rota namespace'leri, **ayrı talep-detay sayfaları**. Backend
API **değişmez** (`canReply` owner-temelli ve admin-kendi-talebinde-403 zaten doğru).

## 3. Mimari (yalnız `src/client/` + `src/index.ts`)

### 3.1 İki layout
- **`EmployeeLayout`** (`src/client/layouts/EmployeeLayout.tsx`): üst header —
  `Taleplerim` · `Yeni Talep`; admin ise ek "Yönetim →" geçiş linki; kullanıcı adı +
  Çıkış. Mevcut header stilinin sadeleştirilmiş hali.
- **`AdminLayout`** (`src/client/layouts/AdminLayout.tsx`): **ayrı konsol görünümü** —
  sol **sidebar**: marka "Talep Portalı — Yönetim", nav `Tüm Talepler` · `Tanımlar`,
  altta "← Çalışan alanı" linki (→ `/my`); üstte kullanıcı adı + Çıkış; sağda içerik
  (`Outlet`). `surface-tonal` sidebar zemini ile görsel ayrım.
- Her iki layout `AuthGate` ile sarılır: `/api/me` yüklenir, `UserContext` sağlanır,
  401'de `api.ts` zaten `/auth/google`'a yönlendirir. (Mevcut `AppLayout`'taki
  `/api/me` yükleme mantığı `AuthGate`'e çıkarılır; iki layout onu paylaşır.)
- **AdminLayout admin-gate'lidir:** `useUser().isAdmin` değilse `<Navigate to="/my"/>`.

### 3.2 Rotalar (`src/client/app.tsx`)
```
/login                         → Login (gate dışı)
/                              → <Home/> (rol yönlendirici: admin→/admin, çalışan→/my)
EmployeeLayout:
  /yeni                        → NewRequest
  /my                          → MyList
  /requests/:id                → RequestDetailEmployee   (kendi talebim — cevap)
AdminLayout (admin-only):
  /admin                       → AdminList (Tüm Talepler)
  /admin/tanimlar              → Definitions
  /admin/requests/:id          → RequestDetailAdmin      (inceleme — netleştir/karar)
*                              → <Navigate to="/"/>
```
`Home` redirector `AuthGate`/context içinde render edilir ki `useUser()` çalışsın.
(Pratik: `/` route'u küçük bir `AuthGate` sarmalı altında `Home`'u render eder.)

### 3.3 İki talep-detay sayfası
İkisi de `GET /api/requests/:id` ile `{request, messages, attachments}` çeker; ortak
sunum bileşenlerini paylaşır.
- **`RequestDetailEmployee`** (`/requests/:id`, EmployeeLayout): `RequestMeta` + `Thread`
  + (sahip & `clarifying` ise) **ReplyForm**. Sahip değilse/erişemezse 404 notu.
- **`RequestDetailAdmin`** (`/admin/requests/:id`, AdminLayout): `RequestMeta` + `Thread`
  + **AdminControls** (Soru ekle + Kabul/Ret). Talep **admin'in kendisine aitse** →
  AdminControls yerine bir not: "Bu sizin talebiniz — cevaplamak için Taleplerim'e
  gidin" + `/requests/:id` linki (backend zaten 403 döndürür; UI de yönlendirir).

### 3.4 Liste kart linkleri
- `MyList` kartları → `/requests/:id`.
- `AdminList` kartları → `/admin/requests/:id`.
- `RequestCard` bir `to`/`hrefBase` prop'u alır (ör. `basePath: "/requests" | "/admin/requests"`)
  ki aynı bileşen iki alanda da kullanılsın (DRY).

### 3.5 Paylaşılan bileşenler (DRY)
- Mevcut `Thread`, `Attachments`, `StatusBadge` korunur/paylaşılır.
- Mevcut `RequestDetail.tsx`'in meta kartı `RequestMeta` bileşenine çıkarılır; reply
  formu `ReplyForm` (zaten var, ayrılır), admin kontrolleri `AdminControls` (zaten var).
- Eski tek `RequestDetail.tsx` kaldırılır; yerine iki ince sayfa + paylaşılan parçalar.

### 3.6 `src/index.ts`
Bun.serve `routes`'a `/admin/requests/:id` shell rotası eklenir (deep-link/refresh için;
mevcut `/admin`, `/admin/tanimlar`, `/requests/:id` gibi). `/yeni`, `/my` zaten var.

## 4. Davranış matrisi
| Kim | Nereden | Gider | Görür |
|---|---|---|---|
| Çalışan | giriş `/` | `/my` | EmployeeLayout |
| Admin | giriş `/` | `/admin` | AdminLayout (sidebar) |
| Admin | AdminList'te başkasının talebi | `/admin/requests/:id` | inceleme: Soru ekle + Kabul/Ret |
| Admin | AdminList'te kendi talebi | `/admin/requests/:id` | not + "Taleplerim" linki (aksiyon yok) |
| Admin | Taleplerim'de kendi talebi | `/requests/:id` | cevap formu (clarifying ise) |
| Çalışan | Taleplerim'de talebi | `/requests/:id` | cevap formu (clarifying ise) |
| Herkes | başkasının `/requests/:id` veya `/admin/requests/:id` yetkisiz | — | 404 (backend) |

## 5. Test
- Backend testleri değişmez (192 yeşil kalır).
- Frontend: `bun run build` gate; görsel doğrulama (Playwright/manuel):
  admin landing `/admin` + sidebar; admin başkasının talebi `/admin/requests/:id`
  inceleme; admin kendi talebi → yönlendirme notu; çalışan `/requests/:id` cevap;
  liste kartları doğru namespace'e gider.

## 6. Kapsam Dışı (YAGNI)
- Ayrı bundle / ayrı `index.html` / ayrı subdomain (önceki kararla elendi).
- Backend API değişikliği.
- Rol-bazlı tema/renk paleti (sidebar ayrımı yeterli).
- Admin için yeni metrik/dashboard widget'ları (Faz D).

## 7. Riskler
- **RequestDetail bölünmesi** kod tekrarı riski → meta/thread/attachments ortak
  bileşenlerle DRY tutulur.
- **CLAUDE.md §2** `src/client/` açıklaması güncellenmeli (layouts/ + iki detay sayfası).
- Eski `/requests/:id` linklerine bağlı yerler (mail gövdesindeki linkler!) kontrol:
  mail'ler `appBaseUrl + /requests/:id` ve `+ /admin/requests/:id` kullanıyor — admin
  bildirim maili `/admin/requests/:id`'e işaret etmeli (artık gerçek bir admin sayfası);
  requester maili `/requests/:id`. Mevcut mail metinleri zaten bu path'leri kullanıyor;
  doğrulanır (backend route'larındaki link metinleri).
