# Yönetici Özet Paneli (Dashboard) — Tasarım

- **Tarih:** 2026-06-13
- **Durum:** Onaylandı (brainstorm)
- **Bağlam:** Bun.serve + React SPA portalı. CLAUDE.md §8 "Sonraki Faz D" altında
  listelenen yönetici dashboard'u. Admin alanına anlık bir özet/triyaj görünümü
  eklenir.

## 1. Problem

Admin'in açılış sayfası bütün taleplerin düz listesidir (`/admin`). Genel durumu
görmek (kaç açık, hangi durumda, hangi öncelikte) veya **takılıp kalmış** talepleri
fark etmek için listeyi elle taramak gerekir. Bir bakışta sağlık + iş yükü + triyaj
veren bir özet ekranı yok.

## 2. Karar (brainstorm)

Yönetici alanına **açılış sayfası** olarak bir Özet paneli eklenir. Anlık görüntü
(snapshot) — **zaman serisi/trend yok**. Üç işi karşılar: genel sağlık özeti, iş yükü
dağılımı (durum + öncelik kırılımı), ve **yaşlanan açık talep triyajı**.

- Gösterim: **sade CSS çubuk + sayı kartı**. Grafik kütüphanesi eklenmez (CLAUDE.md'nin
  "framework şişkinliği yok" çizgisi).
- Backend API'ye tek yeni okuma ucu eklenir; mutasyon yok, mevcut FSM/authz dokunulmaz.

## 3. "Yaşlı/dikkat" tanımı

- **Yaş = son hareketten beri.** `last_activity_at = COALESCE(MAX(mesaj.created_at),
  talep.created_at)`. Aktif yazışılan talep yaşlı sayılmaz; gerçekten takılanı gösterir.
- **Eşik = 7 gün** (domain sabiti `AGED_THRESHOLD_DAYS = 7`).
- **Aday = açık (terminal olmayan) talepler:** `new`, `clarifying`, `answered`.
  `clarifying` (çalışanı bekleyen) de 7 günden uzun hareketsizse dahil edilir — kasıtlı;
  admin dürtmek isteyebilir.
- **Açık (open) sayısı** = `new` + `clarifying` + `answered`.

## 4. İçerik & Yerleşim (Düzen B — iki sütun)

```
┌───────────────┬───────────────┬───────────────┐
│ Toplam   128  │ Açık     23   │ 7g+ Bekleyen 5│   ← sayı kartları (sonuncu alarm rengi)
└───────────────┴───────────────┴───────────────┘
┌───────────────────────────┬───────────────────┐
│ Durum dağılımı            │ Öncelik (açık)    │   ← iki sütun, yatay CSS çubuk
│ Yeni            ▓▓▓ 7      │ Yüksek  ▓▓▓ 8     │
│ Netleştiriliyor ▓▓▓▓▓ 11  │ Orta    ▓▓▓▓ 12   │
│ Cevaplandı      ▓▓ 5      │ Düşük   ▓ 3       │
│ Kabul edildi    ▓▓▓▓▓ 82  │                   │
│ Reddedildi      ▓▓ 23     │                   │
└───────────────────────────┴───────────────────┘
┌───────────────────────────────────────────────┐
│ Dikkat bekleyen (7+ gün hareketsiz)           │   ← linkli liste
│ TLP-0042  Stok modülü rapor…  [Cevaplandı] 12g│
│ TLP-0039  Muhasebe entegrasyon [Yeni]       9g│
│ TLP-0035  Üretim emri ekranı [Netleş.]      8g│
└───────────────────────────────────────────────┘
```

- **Sayı kartları:** Toplam · Açık · 7g+ Bekleyen (`agedCount`, alarm rengi).
- **Durum dağılımı:** 5 durumun tamamı, yatay çubuk + sayı. Durum renkleri mevcut
  `StatusBadge` paletiyle tutarlı.
- **Öncelik:** **yalnız açık talepler** üzerinden (Yüksek/Orta/Düşük).
- **Dikkat kutusu:** yaşlı açık talepler, yaşa göre **azalan** sıralı. Her satır
  `/admin/requests/:id`'e link; talep no, başlık, durum etiketi, yaş (gün). Boşsa
  "Bekleyen yok" mesajı.

## 5. Mimari (katmanlamayı koruyarak)

### 5.1 `src/domain/stats.ts` (yeni, zero-I/O)
- `AGED_THRESHOLD_DAYS = 7` sabiti.
- `ageInDays(lastActivityIso: string, now: Date): number` — tam gün farkı.
- `buildDashboardStats(rows, now)` — **saf** fonksiyon: `last_activity_at` taşıyan ham
  talep satırlarını alıp `{ total, open, agedCount, byStatus, openByPriority, aged }`
  döndürür. Tüm sayım/eşik/sıralama mantığı burada; **exhaustive birim test** burada.
- Satır tipi (girdi): `{ id, request_no, title, status, priority, created_at,
  last_activity_at }`.

**Neden domain'de toplama (SQL `GROUP BY` değil):** iç araç ölçeğinde (yüzlerce talep)
tüm satırları belleğe almak ucuz; karşılığında eşik + yaş + kırılım mantığı tamamen saf
ve exhaustive test edilebilir — projenin "domain zero-I/O, exhaustive test" çizgisine
uyar. SQL'e eşik/iş kuralı sızmaz.

### 5.2 `src/db/repo.ts`
- Tek yeni metot: `listForStats()` — her talebi `last_activity_at` ile döndürür:
  ```sql
  SELECT r.id, r.request_no, r.title, r.status, r.priority, r.created_at,
         COALESCE(MAX(m.created_at), r.created_at) AS last_activity_at
  FROM requests r
  LEFT JOIN messages m ON m.request_id = r.id
  GROUP BY r.id
  ORDER BY r.id DESC
  ```
- İş mantığı taşımaz; ham satır verir.

### 5.3 `src/server/routes/admin.ts`
- `GET /api/admin/stats` — admin-gate (admin değilse 403 JSON). `repo.listForStats()`
  satırlarını `deps.now()` ile `buildDashboardStats`'a verir, sonucu JSON döner.

### 5.4 `src/client/pages/Dashboard.tsx` (yeni)
- `/api/admin/stats`'ı fetch eder (`apiGet`), kartlar + iki sütun çubuk + triyaj listesi
  render eder. Diğer admin sayfaları gibi `useUser().isAdmin` admin-gate'i + yükleme
  spinner'ı + hata durumu. Çubuk genişlikleri her panelin **kendi maksimumuna** göre
  normalize edilir.
- Öncelik etiketleri (Türkçe) için istemci `labels.ts`'e küçük bir map eklenir
  (`{ high: "Yüksek", medium: "Orta", low: "Düşük" }`); durum etiketleri mevcut
  `statusLabelTr`'den gelir.

### 5.5 Rotalar & navigasyon
- `src/client/app.tsx`: `/admin` → **`Dashboard`**; mevcut liste **`/admin/talepler`**'e
  taşınır (`Admin.tsx` aynı bileşen, yeni path). Admin home-redirect hedefi (`/admin`)
  değişmez — artık dashboard'a düşer.
- `src/client/layouts/AdminLayout.tsx` sidebar: **Özet** (`/admin`, `end`) · **Tüm
  Talepler** (`/admin/talepler`) · **Tanımlar** (`/admin/tanimlar`).

## 6. Veri şekli (`GET /api/admin/stats`)

```json
{
  "total": 128,
  "open": 23,
  "agedCount": 5,
  "byStatus": { "new": 7, "clarifying": 11, "answered": 5, "accepted": 82, "rejected": 23 },
  "openByPriority": { "high": 8, "medium": 12, "low": 3 },
  "aged": [
    { "id": 42, "request_no": "TLP-0042", "title": "Stok modülü rapor talebi",
      "status": "answered", "age_days": 12 }
  ]
}
```

- `byStatus` 5 durumun tamamını içerir (sayı 0 olsa da anahtar var).
- `openByPriority` 3 önceliği içerir, **yalnız açık talepler** üzerinden.
- `aged` yaşa göre azalan sıralı; boş olabilir.

## 7. Sınır durumları

- **Boş DB:** tüm sayılar 0, `aged: []`. İstemci "Bekleyen yok" gösterir.
- **Mesajsız talep:** `last_activity_at = created_at`.
- **Sınır:** tam 7 günlük hareketsizlik **yaşlı sayılır** (`>= 7`).
- **Terminal talepler** açık sayımına/öncelik kırılımına/yaşlı listeye girmez.

## 8. Test

- **`src/domain/stats.test.ts`** (exhaustive): boş girdi; durum/öncelik sayımı; eşik
  sınırı (6/7/8 gün); terminal hariç tutma; öncelik yalnız-açık; yaşa göre azalan
  sıralama; mesajsız talep `created_at`'e düşer.
- **`src/server/routes/admin.test.ts`**: `GET /api/admin/stats` → admin değil **403**;
  admin + tohumlanmış veri → **200** ve beklenen şekil/sayılar (in-memory SQLite,
  `makeHandler`, sabit `now`).
- İstemci sayfası: mevcut desen (api wrapper testli); sayfa testi opsiyonel.

## 9. Kapsam dışı (bu spec değil)

- Zaman serisi/trend, ortalama çözüm süresi.
- Departman/modül kırılımı (brainstorm'da kapsam dışı bırakıldı).
- Yapılandırılabilir eşik (.env) — şimdilik sabit 7 gün.
- GitHub issue dönüşümü, AI soru üretimi (ayrı Faz D işleri).
