# Markdown Desteği — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Uzun-metin alanlarına markdown: `react-markdown` ile güvenli görüntüleme (RequestMeta, Thread) ve `@uiw/react-md-editor` toolbar editörü (formlar). Güvenlik = `rehype-sanitize` + react-markdown'ın varsayılan güvenliği; bun test'te doğrulanır.

**Architecture:** `MarkdownView` (react-markdown + remark-gfm + rehype-sanitize) görüntüleme; `MarkdownEditor` (@uiw `MDEditor` + rehype-sanitize önizleme) editör — controlled (value/onChange) VEYA uncontrolled+gizli input (name) modlarını destekler. Backend değişmez.

**Tech Stack:** React 19, react-markdown, remark-gfm, rehype-sanitize, @uiw/react-md-editor. Bun 1.3.

---

## File map
- YENİ: `src/client/components/MarkdownView.tsx` (+`MarkdownView.test.tsx`), `src/client/components/MarkdownEditor.tsx`
- DEĞİŞİR: `src/client/components/RequestMeta.tsx`, `Thread.tsx` (MarkdownView), `src/client/pages/NewRequest.tsx`, `src/client/components/ReplyForm.tsx`, `src/client/components/AdminControls.tsx` (MarkdownEditor), `src/styles/app.css` (`.md-view`), ve editör CSS için `src/client/main.tsx`/`index.ts`/`package.json` (Task 2).

---

## Task 1: MarkdownView (react-markdown) + güvenlik testi + görüntüleme yerleri

**Files:** Create `src/client/components/MarkdownView.tsx`, `src/client/components/MarkdownView.test.tsx`; Modify `src/client/components/RequestMeta.tsx`, `src/client/components/Thread.tsx`, `src/styles/app.css`.

- [ ] **Step 1: Deps**
Run:
```bash
bun add react-markdown remark-gfm rehype-sanitize
```

- [ ] **Step 2: Failing security+render test — `src/client/components/MarkdownView.test.tsx`**
```tsx
import { expect, test, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownView } from "./MarkdownView";

const render = (src: string) => renderToStaticMarkup(<MarkdownView source={src} />);

describe("MarkdownView security", () => {
  test("strips raw <script>", () => {
    const html = render("merhaba <script>alert(1)</script> son");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)</script>");
  });
  test("drops javascript: link href", () => {
    const html = render("[tıkla](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });
  test("drops javascript: image src", () => {
    const html = render("![x](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });
  test("strips inline event handler from raw html img", () => {
    const html = render('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
  });
});

describe("MarkdownView rendering", () => {
  test("bold + list + safe link + image", () => {
    const html = render("**kalın**\n\n- a\n- b\n\n[link](https://x.com) ![alt](https://x.com/i.png)");
    expect(html).toContain("<strong>kalın</strong>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain('href="https://x.com"');
    expect(html).toContain('src="https://x.com/i.png"');
  });
});
```
Run: `bun test src/client/components/MarkdownView.test.tsx` → FAIL (module yok).

- [ ] **Step 3: Implement `src/client/components/MarkdownView.tsx`**
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
Run: `bun test src/client/components/MarkdownView.test.tsx` → PASS.
NOTE: if `renderToStaticMarkup` of react-markdown fails to run under bun for any ESM reason, do NOT weaken the test — investigate (react-markdown v10 is ESM + SSR-safe; bun supports it). If `rehype-sanitize`'s default schema strips images entirely (some schemas restrict `img`), the "image" render assertion will fail — in that case configure `rehype-sanitize` with a schema that allows `img` with `src`/`alt` over http/https (extend the default `defaultSchema`: add `img` to tagNames and `src`,`alt` to attributes). Keep all security assertions passing. Document the schema used in a comment.

- [ ] **Step 4: `.md-view` styles — `src/styles/app.css`**
Add (inside the file, after the base layer):
```css
.md-view { font-size: 0.875rem; line-height: 1.5; color: #191c1f; }
.md-view > :first-child { margin-top: 0; }
.md-view > :last-child { margin-bottom: 0; }
.md-view p { margin: 0 0 0.75rem; }
.md-view h1, .md-view h2, .md-view h3 { font-weight: 600; margin: 1rem 0 0.5rem; line-height: 1.25; }
.md-view h1 { font-size: 1.125rem; } .md-view h2 { font-size: 1.05rem; } .md-view h3 { font-size: 1rem; }
.md-view ul, .md-view ol { margin: 0 0 0.75rem; padding-left: 1.25rem; }
.md-view ul { list-style: disc; } .md-view ol { list-style: decimal; }
.md-view li { margin: 0.125rem 0; }
.md-view a { color: #0F4C81; text-decoration: underline; }
.md-view code { background: #ededf3; padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.85em; }
.md-view pre { background: #ededf3; padding: 0.75rem; border-radius: 6px; overflow-x: auto; margin: 0 0 0.75rem; }
.md-view pre code { background: none; padding: 0; }
.md-view blockquote { border-left: 3px solid #c2c7d1; padding-left: 0.75rem; color: #42474f; margin: 0 0 0.75rem; }
.md-view img { max-width: 100%; height: auto; border-radius: 6px; }
.md-view table { border-collapse: collapse; margin: 0 0 0.75rem; }
.md-view th, .md-view td { border: 1px solid #E2E8F0; padding: 0.35rem 0.6rem; }
```
Run `bun run build:css` to confirm Tailwind/CSS compiles.

- [ ] **Step 5: Wire RequestMeta + Thread**
`src/client/components/RequestMeta.tsx`: import `import { MarkdownView } from "./MarkdownView";`. Replace the two
```tsx
<p className="text-sm text-on-surface whitespace-pre-wrap">{req.description}</p>
```
and the expected_benefit one with:
```tsx
<MarkdownView source={req.description} />
```
```tsx
<MarkdownView source={req.expected_benefit} />
```
(Keep the surrounding "Açıklama"/"Beklenen Fayda" labels.)
`src/client/components/Thread.tsx`: import MarkdownView; replace the message-body render — change the bubble's `whitespace-pre-wrap` `{msg.body}` block to render `<MarkdownView source={msg.body} />` inside the bubble div (keep the bubble container + its border/bg classes; drop `whitespace-pre-wrap` since MarkdownView handles formatting).

- [ ] **Step 6: Build + tests + commit**
Run: `bun run build` → succeeds. `bun test` → all green (201 + new MarkdownView tests).
```bash
git add src/client/components/MarkdownView.tsx src/client/components/MarkdownView.test.tsx src/client/components/RequestMeta.tsx src/client/components/Thread.tsx src/styles/app.css package.json bun.lock
git commit -m "feat: markdown rendering for request/thread (react-markdown + sanitize)"
```

---

## Task 2: MarkdownEditor (@uiw) + editor CSS + wire form fields

**Files:** Create `src/client/components/MarkdownEditor.tsx`; Modify `src/client/main.tsx` (editor CSS import) + `src/index.ts`/`package.json` if needed (CSS serving), `src/client/pages/NewRequest.tsx`, `src/client/components/ReplyForm.tsx`, `src/client/components/AdminControls.tsx`.

- [ ] **Step 1: Dep + verify editor CSS bundling**
Run: `bun add @uiw/react-md-editor`.
Determine the CSS-loading mechanism (the spec's integration risk):
1. Add `import "@uiw/react-md-editor/markdown-editor.css";` to the TOP of `src/client/main.tsx`.
2. Run `bun run build:client` and inspect `public/` for an emitted CSS file. Run: `ls -la public/*.css && grep -l "w-md-editor" public/*.css 2>/dev/null`.
   - **If** `bun build` emits a CSS asset (e.g. `public/client.css` or inlines via the bundle): link it in `src/client/index.html` (`<link rel="stylesheet" href="/<emitted>.css">`) and add a `routes` entry in `src/index.ts` serving it (like `/app.css`). Re-run `build:html`.
   - **If** `bun build` does NOT emit usable CSS (import ignored / errors): FALLBACK — remove the main.tsx import; instead add a `package.json` script `"build:editorcss": "cp node_modules/@uiw/react-md-editor/markdown-editor.css public/md-editor.css"`, chain it into `build`, link `<link rel="stylesheet" href="/md-editor.css">` in index.html, and serve `/md-editor.css` via `src/index.ts` `routes` (Bun.file). (Resolve the real CSS path first: `find node_modules/@uiw/react-md-editor -name "*.css" | head`.)
Document which path you used in the commit message. The gate: the editor renders styled (toolbar visible) when served — verified visually in Task 3.

- [ ] **Step 2: Implement `src/client/components/MarkdownEditor.tsx`**
Supports BOTH controlled (`value`+`onChange`) and uncontrolled+hidden-input (`name`+`defaultValue`) usage:
```tsx
import { useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import rehypeSanitize from "rehype-sanitize";

type Common = { maxLength?: number; required?: boolean; height?: number; placeholder?: string };
type Controlled = Common & { value: string; onChange: (v: string) => void; name?: undefined };
type Uncontrolled = Common & { name: string; defaultValue?: string; value?: undefined; onChange?: undefined };

export function MarkdownEditor(props: Controlled | Uncontrolled) {
  const { maxLength, required, height = 200, placeholder } = props;
  const controlled = props.value !== undefined;
  const [internal, setInternal] = useState(controlled ? "" : (props.name ? (props.defaultValue ?? "") : ""));
  const value = controlled ? (props.value as string) : internal;
  const setValue = (v: string) => {
    if (controlled) props.onChange!(v);
    else setInternal(v);
  };
  return (
    <div data-color-mode="light">
      <MDEditor
        value={value}
        onChange={(v) => setValue(v ?? "")}
        height={height}
        textareaProps={{ maxLength, required, placeholder }}
        previewOptions={{ rehypePlugins: [[rehypeSanitize]] }}
      />
      {!controlled && props.name && (
        <input type="hidden" name={props.name} value={value} />
      )}
    </div>
  );
}
```
(Form-based fields use `name`+`defaultValue` → hidden input feeds `new FormData(form)`. The reject-reason field uses `value`+`onChange` → parent owns it.)

- [ ] **Step 3: Wire NewRequest (description, expected_benefit)**
In `src/client/pages/NewRequest.tsx`, import `MarkdownEditor`. Replace the `<textarea name="description" ...>` with:
```tsx
<MarkdownEditor name="description" required maxLength={5000} />
```
and `<textarea name="expected_benefit" ...>` with:
```tsx
<MarkdownEditor name="expected_benefit" required maxLength={2000} />
```
(Keep the field labels/wrappers. `new FormData(formRef.current)` then captures the hidden inputs. The existing `fd.set("department"...)` lines are unaffected.)

- [ ] **Step 4: Wire ReplyForm (body)**
In `src/client/components/ReplyForm.tsx`, replace the `<textarea name="body" ...>` with:
```tsx
<MarkdownEditor name="body" required maxLength={5000} />
```
(Form submit uses `new FormData(formRef.current)` → hidden input captured.)

- [ ] **Step 5: Wire AdminControls (message body + reject reason)**
In `src/client/components/AdminControls.tsx`:
- Message form (form-based, `new FormData(formRef.current)`): replace `<textarea name="body" ...>` with `<MarkdownEditor name="body" required maxLength={5000} />`.
- Reject reason (controlled `rejectReason`/`setRejectReason`, FormData built manually): replace that `<textarea value={rejectReason} onChange=...>` with:
```tsx
<MarkdownEditor value={rejectReason} onChange={setRejectReason} required maxLength={2000} height={160} />
```
(The `decide("reject", rejectReason)` call already passes `rejectReason` → no submit change needed.)

- [ ] **Step 6: Build + tests + commit**
Run: `bun run build` → succeeds (incl. editor CSS). `bun test` → all green.
```bash
git add -A
git commit -m "feat: markdown editor (@uiw) for request/reply/admin text fields"
```

---

## Task 3: Final verification + visual

**Files:** (none — verification)

- [ ] **Step 1: Full test + build**
Run: `bun test` → all green. `bun run build` → succeeds. Confirm the editor CSS asset is produced + linked.

- [ ] **Step 2: Visual smoke (seeded server + admin cookie)**
Start server (dev-tour.db or fresh seed). Verify in browser:
- New Talep formunda açıklama/fayda alanları **toolbar'lı editör**; "Önizle" sekmesi markdown'ı render ediyor.
- Bir talep oluştur (açıklamaya `**kalın**`, liste, `[link](https://...)`, `![](https://.../img.png)` yaz) → detayda **render edilmiş** görün.
- Thread'de admin sorusu / cevap markdown render oluyor.
- **Güvenlik:** açıklamaya `<script>alert(1)</script>` ve `[x](javascript:alert(1))` yaz → detayda zararsız (script çalışmaz, link tıklanınca js çalışmaz). (Birim test zaten zorluyor; görsel teyit.)
- Editör stilleri yükleniyor (toolbar düzgün görünüyor).

- [ ] **Step 3: finishing-a-development-branch**
Use `superpowers:finishing-a-development-branch`.

---

## Self-Review Notları
- **Spec kapsamı:** §3 deps→Task1/2; §4.1 MarkdownView→Task1; §4.2 MarkdownEditor→Task2; §5 yerleşim→Task1(view)+Task2(editor); §6 CSS→Task2 Step1; §7 test→Task1 + Task3. Tümü karşılanıyor.
- **Güvenlik testi gerçek pipeline'ı test eder** (`renderToStaticMarkup(<MarkdownView>)`), divergent yardımcı yok. rehype-sanitize'ın img'i strip etmesi ihtimaline karşı şema notu (Task1 Step3).
- **FormData iki mod:** form-tabanlı alanlar (description/expected_benefit/reply body/admin message) gizli input ile; reject reason controlled (parent zaten `rejectReason` geçiriyor). MarkdownEditor her ikisini destekler.
- **CSS riski** Task2 Step1'de doğrulama-güdümlü, fallback'li çözülür.
- **Backend dokunulmaz**; mevcut 201 test yeşil kalır; +MarkdownView güvenlik testleri.
- **maxLength** zod limitleriyle senkron (5000/2000).
