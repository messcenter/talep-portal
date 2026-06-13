# WYSIWYG Editör (TipTap, markdown depolama) — Tasarım

- **Tarih:** 2026-06-13
- **Durum:** Onaylandı (brainstorm + araştırma)
- **Bağlam:** Az önce markdown desteği eklendi (MD1: react-markdown görüntüleme + güvenlik
  testleri; MD2: @uiw/react-md-editor markdown-source editörü). Kullanıcı **gerçek WYSIWYG**
  ("yazarken kalın görünsün") istiyor — markdown sözdizimi yazmak değil.

## 1. Amaç

Form metin alanlarında **WYSIWYG zengin metin** editörü (TipTap). Depolama **markdown**
kalır → mevcut güvenli `react-markdown` görüntüleme + testleri korunur, **backend
değişmez**. @uiw markdown-source editörü TipTap WYSIWYG ile değiştirilir.

## 2. Kararlar (brainstorm + araştırma)

| Karar | Seçim |
|---|---|
| Mimari | **B**: WYSIWYG editör, **markdown** depolama (HTML değil) |
| Editör | **TipTap** (`@tiptap/react` + StarterKit + link + image + `tiptap-markdown`) |
| Görüntüleme | **DEĞİŞMEZ** — `MarkdownView` (react-markdown + rehype-sanitize) |
| Toolbar | Kendi küçük toolbar'ımız (TipTap headless) |
| Backend | Değişmez |
| @uiw | Kaldırılır (+ CSS-serve makinesi) |

**Neden B:** WYSIWYG deneyim verir ama depolama markdown kalır → MD1'in test edilmiş,
güvenli görüntülemesi aynen kullanılır; sunucuya HTML sanitize eklemeye gerek yok.
**Güvenlik:** TipTap yalnız şema-içi node/mark üretir (yapıştırılan `<script>` doc'a
girmez); çıktı markdown → `MarkdownView` zaten sanitize eder; `javascript:` link render'da
düşürülür. Yani güvenlik MD1 ile aynı, ek yüzey yok.

## 3. Bağımlılıklar
- **Eklenir:** `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`,
  `@tiptap/extension-link`, `@tiptap/extension-image`, `tiptap-markdown`.
- **Kaldırılır:** `@uiw/react-md-editor`.
- `react-markdown`/`remark-gfm`/`rehype-sanitize` **kalır** (görüntüleme).

## 4. Bileşen — `src/client/components/RichTextEditor.tsx` (MarkdownEditor'ın yerine)

WYSIWYG editör; değeri **markdown** olarak verir. İki mod (MD2'deki MarkdownEditor API'siyle
aynı imza) — mevcut kullanım yerleri değişmez:
- **Uncontrolled + gizli input:** `name` + `defaultValue` → gizli `<input name>` markdown
  değerini taşır (form `new FormData(form)` ile yakalar). NewRequest (description,
  expected_benefit), ReplyForm (body), AdminControls message body.
- **Controlled:** `value` + `onChange` → parent owns. AdminControls reject reason.

İç yapı:
- `useEditor({ extensions: [StarterKit, Link.configure({...}), Image, Markdown], ... })`.
- `onUpdate` → `editor.storage.markdown.getMarkdown()` → setValue (controlled: onChange;
  uncontrolled: internal state + gizli input).
- **Toolbar:** kalın, italik, üstü çizili, başlık (H2/H3), madde listesi, numaralı liste,
  alıntı, kod, link (URL sorar — http/https doğrula), görsel (URL sorar — http/https
  doğrula). Butonlar `editor.chain().focus().toggleBold().run()` vb.; aktif durum
  `editor.isActive('bold')` ile vurgulanır.
- `maxLength`: CharacterCount extension EKLENMEZ (YAGNI). Sunucu zod limiti (5000/2000)
  otantik gate'tir; `maxLength` prop'u API'de durur ama UI'da zorlanmaz.
- Tüm kullanımlar yeni içerik → editöre mevcut markdown **yüklenmez** (sadece çıktı).
  (`defaultValue` boş geçilir; ileride edit akışı olursa Markdown extension parse de eder.)

## 5. Stil — `src/styles/app.css`
TipTap headless → editör alanını (`.ProseMirror` / sarmalayıcı) stillendir: kenarlık +
focus ring (mevcut input stiliyle uyumlu), `.ProseMirror` içi WYSIWYG görünüm
(strong/em/list/heading/blockquote/code) — `.md-view` ile tutarlı tipografi. Toolbar
butonları için küçük stil (aktif buton primary vurgu). `@uiw` CSS bloğu/`md-editor.css`
serve makinesi kaldırılır.

## 6. MD2 temizliği (bu işin parçası)
- `src/client/components/MarkdownEditor.tsx` silinir (yerine RichTextEditor).
- `package.json`: `@uiw/react-md-editor` kaldır; `build:client`/`dev:client`'tan
  `--loader .css:text` çıkar; `build:editorcss` script'i ve `build` zincirinden kaldır.
- `src/index.ts`: `/md-editor.css` route'u kaldır. `src/client/index.html`: `md-editor.css`
  `<link>` kaldır. `src/client/main.tsx`: varsa @uiw CSS importu kaldır.
- `public/md-editor.css` artık üretilmez.

## 7. Kullanım yerleri (MarkdownEditor → RichTextEditor)
| Yer | Alan | Mod |
|---|---|---|
| NewRequest | description (maxLength 5000), expected_benefit (2000) | name + hidden |
| ReplyForm | body (5000) | name + hidden |
| AdminControls | message body (5000) | name + hidden |
| AdminControls | reject reason (2000) | value + onChange |

(maxLength prop'u API'de kalır ama CharacterCount yoksa yalnız ileride kullanılmak üzere;
sunucu zod limiti otantik. Form submit ve display akışı değişmez.)

## 8. Test
- **MarkdownView güvenlik/render testleri** (MD1) aynen geçerli — değişmez.
- **RichTextEditor markdown çıktısı:** TipTap DOM ister; bun test'te `useEditor` çalışmaz
  → ağır render testi yerine: `tiptap-markdown` serileştirmesini doğrulayan hafif bir
  test (Editor'ı headless ProseMirror ile kurup `**kalın**`/liste çıktısı) **mümkünse**;
  değilse build gate + görsel doğrulama. **Karar:** birincil gate = `bun run build` +
  `bun test` (mevcut 216 yeşil) + görsel smoke (toolbar, WYSIWYG, oluşturulan talebin
  detayda render'ı). TipTap için birim test zorlamıyoruz (DOM bağımlı).
- Görsel: editörde kalın/liste yazınca anında biçimli görünür; talep oluştur → detayda
  doğru render; `javascript:` link denemesi render'da zararsız (MD1 garantisi).

## 9. Kapsam Dışı (YAGNI)
- Mevcut markdown içeriğini editöre geri yükleme (edit akışı yok).
- Collaborative editing, tablo, dipnot, matematik.
- Görsel **yükleme** (URL ile ekleme; dosya zaten ekler ile).
- Sunucu-tarafı HTML sanitize (markdown depolandığı için gerekmez).

## 10. Riskler
- **TipTap + React 19 + bun bundle:** TipTap React-first, ESM; `bun build` ile bundle'lanır.
  Plan ilk adımı bunu doğrular (build + sayfada editör çalışır).
- **`tiptap-markdown` çıktısı ↔ react-markdown render uyumu:** ikisi de GFM-uyumlu;
  görsel smoke ile teyit. Uyumsuzluk olursa StarterKit/Markdown opsiyonları ayarlanır.
- **DOM-bağlı test eksikliği:** TipTap birim testi yok; güvenlik MD1 testleriyle
  (görüntüleme) zaten garanti — editör yalnız markdown üretir.
