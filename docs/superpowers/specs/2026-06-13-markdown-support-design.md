# Markdown Desteği (text alanları) — Tasarım

- **Tarih:** 2026-06-13
- **Durum:** Onaylandı (brainstorm)
- **Bağlam:** Bun.serve + React SPA; uzun-metin alanları (açıklama, beklenen fayda,
  cevap/soru gövdeleri, ret gerekçesi) şu an düz metin (`whitespace-pre-wrap`).

## 1. Amaç

Uzun-metin alanlarına **markdown** desteği: toolbar'lı editör (kalın/italik/liste/link/
görsel/kod/başlık/alıntı) + canlı önizleme; görüntülemede güvenli render. Hazır,
bakımlı kütüphane kullanılır (elle yazılmaz).

## 2. Karar (brainstorm + araştırma)

| Karar | Seçim |
|---|---|
| Editör | **`@uiw/react-md-editor`** (MIT, aktif) — toolbar + "Yaz/Önizle" |
| Görüntüleme | **`react-markdown`** (+ `remark-gfm`) — varsayılan XSS-güvenli, SSR'da render edilebilir (test edilebilir) |
| Güvenlik | **`rehype-sanitize`** — editör önizlemesinde (zorunlu) + görüntülemede (defense-in-depth) |
| Kapsam | Temel + görsel (`![](url)`); yalnız `http/https` URL |
| Editör UX | Toolbar + "Yaz/Önizle" (kütüphane dahili) |
| Mailler | Kapsam dışı — mailde markdown düz metin kalır |

**Güvenlik gerekçesi:**
- **Görüntüleme (asıl risk — başkasının içeriği):** `react-markdown` varsayılan
  güvenlidir — `dangerouslySetInnerHTML` kullanmaz, raw HTML'i yok sayar,
  `defaultUrlTransform` yalnız `http/https/mailto`'ya izin verir (`javascript:`/`data:`
  engel). SSR-safe olduğu için sanitize davranışı `renderToStaticMarkup` ile **birim
  test edilebilir** (bizim güvenlik gate'imiz için kritik). Üstüne `rehype-sanitize`
  defense-in-depth.
- **Editör önizleme (yazarın kendi içeriği):** @uiw varsayılan sanitize ETMEZ →
  `previewOptions`'a `rehype-sanitize` **zorunlu** eklenir.

## 3. Bağımlılıklar
`@uiw/react-md-editor` (editör), `react-markdown` + `remark-gfm` (görüntüleme),
`rehype-sanitize`. (Peer: react — mevcut.) @uiw kendi editör CSS'ini getirir
(bkz. §6); `react-markdown` çıplak elementler üretir, stiller bizim `.md-view`
bloğumuzda (CSS lib yok).

## 4. Bileşenler (yeni)

### 4.1 `src/client/components/MarkdownView.tsx` (görüntüleme — react-markdown)
```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

export function MarkdownView({ source }: { source: string }) {
  return (
    <div className="md-view">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
```
- `react-markdown` zaten raw HTML'i yok sayar; `rehype-sanitize` defense-in-depth.
- SSR-safe → güvenlik testi `renderToStaticMarkup(<MarkdownView source={payload}/>)` ile.
- Kullanım: `RequestMeta` (açıklama, beklenen fayda) + `Thread` (mesaj gövdeleri) —
  mevcut `whitespace-pre-wrap` `<p>` yerine `<MarkdownView source={...}/>`.
- `.md-view` stilleri `src/styles/app.css`'e eklenir (başlık/liste/kod/alıntı/link/img max-width).

### 4.2 `src/client/components/MarkdownEditor.tsx` (editör)
```tsx
import { useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import rehypeSanitize from "rehype-sanitize";

export function MarkdownEditor({
  name, defaultValue = "", required, maxLength, height = 200,
}: { name: string; defaultValue?: string; required?: boolean; maxLength?: number; height?: number }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div data-color-mode="light">
      <MDEditor
        value={value}
        onChange={(v) => setValue(v ?? "")}
        height={height}
        textareaProps={{ maxLength, required }}
        previewOptions={{ rehypePlugins: [[rehypeSanitize]] }}
      />
      {/* Mirror into a named hidden input so existing FormData submit captures it. */}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
```
- Controlled + **gizli `<input name>`** → mevcut `new FormData(form)` submit mantığı
  değişmeden değeri yakalar.
- `maxLength` mevcut zod limitleriyle senkron geçirilir (açıklama 5000, fayda 2000,
  cevap/soru 5000, gerekçe 2000).
- Önizleme `rehype-sanitize` ile (editör önizlemesi de güvenli).
- Kullanım: NewRequest (açıklama, beklenen fayda), ReplyForm (cevap), AdminControls
  (soru, ret gerekçesi). Eski `<textarea name=...>`'lar bununla değişir.

## 5. Render/Editör yerleşim özeti
| Yer | Alan | Bileşen |
|---|---|---|
| NewRequest | description, expected_benefit | MarkdownEditor |
| ReplyForm | body | MarkdownEditor |
| AdminControls | message body, reason | MarkdownEditor |
| RequestMeta | description, expected_benefit | MarkdownView |
| Thread | message body | MarkdownView |

## 6. CSS Entegrasyonu (yalnız editör — entegrasyon riski, plan adımı)
Görüntüleme (`react-markdown`) çıplak element üretir → kütüphane CSS'i gerekmez; `.md-view`
stillerini `app.css`'e yazarız. Yalnız **@uiw editörü** kendi CSS'ini getirir
(`@uiw/react-md-editor/markdown-editor.css`). Mevcut build: tailwind CLI → `public/app.css`,
`bun build` → `public/client.js`.
**Yaklaşım:** editör CSS'ini `src/client/main.tsx`'te import et; `bun build`'in CSS'i
ayrı asset olarak emit etmesini sağla ve `index.html`/`index.ts`'te servis+link et.
**Fallback:** emit sorun çıkarırsa @uiw CSS'ini `public/`'e kopyalayıp `index.html`'de
`<link>`'le. Plan ilk adımında `bun build` CSS davranışı doğrulanır; çalışan yöntem seçilir.
Editörde `data-color-mode="light"` ile açık tema sabitlenir.

## 7. Test
- **`src/client/components/MarkdownView.test.tsx`** — gerçek bileşeni
  `renderToStaticMarkup(<MarkdownView source={...}/>)` ile render edip çıktı HTML'i
  assert eder (gerçek pipeline'ı test eder, ayrı/divergent yardımcı yok):
  - **Kritik güvenlik:** `<script>alert(1)</script>` → çıktıda `<script` YOK;
    `[x](javascript:alert(1))` → çıktıda `javascript:` YOK (href düşürülür);
    `![](javascript:alert(1))` → güvensiz `src` YOK; raw `<img onerror=...>` → `onerror` YOK.
  - **Doğru render:** `**kalın**` → `<strong>`; `- a\n- b` → `<ul><li>`;
    `[link](https://x.com)` → `<a href="https://x.com"`; `![alt](https://x/i.png)` →
    `<img` + `https://x/i.png`.
- Build gate: `bun run build` (editör CSS dahil) başarılı. `bun test` yeşil (201+).
- Görsel: editör toolbar/önizleme + detay/thread'de render edilmiş MD; bir XSS payload'unun
  zararsız göründüğü manuel doğrulama.

## 8. Kapsam Dışı (YAGNI)
- Tablo/footnote/matematik (KaTeX) gibi gelişmiş MD.
- Mailde MD render.
- Eski kayıt migrasyonu (düz metin zaten geçerli MD; olduğu gibi render olur).
- Görsel **yükleme** (markdown görseli URL ile; dosya yükleme zaten ekler ile).

## 9. Riskler
- **Sanitize unutma = XSS.** Hem `MarkdownView` hem editör önizlemesi `rehype-sanitize`
  almalı; test bunu zorlar (§7). Bu, uygulamanın load-bearing güvenlik duruşunun parçası.
- **CSS entegrasyonu** (§6) build pipeline'ına dokunur; fallback'li.
- **Bundle büyür** (@uiw + markdown). İç araç için kabul; gerekirse sonradan code-split.
- **maxLength + MD:** sayım ham markdown karakterleri üzerinden (zod ham metni doğrular) — tutarlı.
