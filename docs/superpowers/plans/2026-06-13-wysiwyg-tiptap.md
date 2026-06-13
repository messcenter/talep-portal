# WYSIWYG Editör (TipTap) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** @uiw markdown-source editörünü TipTap WYSIWYG editörüyle değiştirmek; depolama markdown kalır (güvenli react-markdown görüntüleme + testleri korunur, backend değişmez).

**Architecture:** `RichTextEditor` (TipTap StarterKit + link + image + placeholder + tiptap-markdown) WYSIWYG; değeri `getMarkdown()` ile markdown üretir. MarkdownEditor (@uiw) ile aynı prop API'si → 5 çağrı yeri minimal değişir. @uiw + CSS-serve makinesi kaldırılır. Görüntüleme (MarkdownView) değişmez.

**Tech Stack:** React 19, TipTap, tiptap-markdown, react-markdown (display, mevcut). Bun 1.3.

---

## File map
- YENİ: `src/client/components/RichTextEditor.tsx`
- SİLİNİR: `src/client/components/MarkdownEditor.tsx`
- DEĞİŞİR: `src/client/pages/NewRequest.tsx`, `src/client/components/ReplyForm.tsx`, `src/client/components/AdminControls.tsx` (import + isim + reset), `src/styles/app.css` (.ProseMirror stilleri), `package.json` (deps + scripts temizliği), `src/index.ts` + `src/client/index.html` (md-editor.css kaldır)
- DEĞİŞMEZ: `src/client/components/MarkdownView.tsx` + testleri; backend.

---

## Task 1: TipTap deps + RichTextEditor + editör stilleri

**Files:** Create `src/client/components/RichTextEditor.tsx`; Modify `src/styles/app.css`. (@uiw henüz kaldırılmaz; build yeşil kalır — MarkdownEditor hâlâ duruyor.)

- [ ] **Step 1: Deps**
Run:
```bash
bun add @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-image @tiptap/extension-placeholder tiptap-markdown
```
Verify install OK. (If `tiptap-markdown` peer-warns on TipTap v3, check its README; it supports current TipTap. If incompatible, the fallback is `@tiptap/extension-markdown` or configuring StarterKit — but `tiptap-markdown` is the standard. Proceed; resolve at build.)

- [ ] **Step 2: Implement `src/client/components/RichTextEditor.tsx`**
Same prop API as the old MarkdownEditor (controlled OR uncontrolled+hidden-input), value is **markdown**:
```tsx
// src/client/components/RichTextEditor.tsx
// WYSIWYG rich-text editor (TipTap). Value is markdown (via tiptap-markdown), so the
// existing react-markdown display + its security tests are reused unchanged.
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { useState, useEffect } from "react";

type Common = { required?: boolean; maxLength?: number; placeholder?: string };
type Controlled = Common & { value: string; onChange: (v: string) => void; name?: undefined; defaultValue?: undefined };
type Uncontrolled = Common & { name: string; defaultValue?: string; value?: undefined; onChange?: undefined };

const isHttp = (u: string) => /^https?:\/\//i.test(u);

function Toolbar({ editor }: { editor: Editor }) {
  const btn = (active: boolean, on: () => void, label: string, title: string) => (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onMouseDown={(e) => { e.preventDefault(); on(); }}
      className={["px-2 py-1 rounded text-sm font-medium leading-none",
        active ? "bg-primary text-primary-fg" : "text-on-surface hover:bg-surface-container"].join(" ")}
    >
      {label}
    </button>
  );
  const addLink = () => {
    const url = window.prompt("Bağlantı URL'si (https://...)");
    if (!url) return;
    if (!isHttp(url)) return window.alert("Yalnız http/https bağlantılarına izin verilir.");
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  const addImage = () => {
    const url = window.prompt("Görsel URL'si (https://...)");
    if (!url) return;
    if (!isHttp(url)) return window.alert("Yalnız http/https görsellerine izin verilir.");
    editor.chain().focus().setImage({ src: url }).run();
  };
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border-subtle bg-surface-tonal p-1">
      {btn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "B", "Kalın")}
      {btn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "I", "İtalik")}
      {btn(editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), "S̶", "Üstü çizili")}
      {btn(editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "H2", "Başlık")}
      {btn(editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), "•—", "Madde listesi")}
      {btn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "1.", "Numaralı liste")}
      {btn(editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), "❝", "Alıntı")}
      {btn(editor.isActive("code"), () => editor.chain().focus().toggleCode().run(), "</>", "Kod")}
      {btn(editor.isActive("link"), addLink, "🔗", "Bağlantı")}
      {btn(false, addImage, "🖼", "Görsel")}
    </div>
  );
}

export function RichTextEditor(props: Controlled | Uncontrolled) {
  const controlled = props.value !== undefined;
  const [internal, setInternal] = useState(controlled ? "" : (props.defaultValue ?? ""));
  const value = controlled ? (props.value as string) : internal;
  const setValue = (v: string) => { if (controlled) props.onChange!(v); else setInternal(v); };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true, protocols: ["http", "https"] }),
      Image,
      Placeholder.configure({ placeholder: props.placeholder ?? "Yazın…" }),
      Markdown,
    ],
    content: controlled ? props.value : (props.defaultValue ?? ""),
    onUpdate: ({ editor }) => setValue(editor.storage.markdown.getMarkdown()),
    editorProps: { attributes: { class: "tiptap focus:outline-none" } },
  });

  // Controlled external resets (e.g. reject reason cleared to "") sync into the editor.
  useEffect(() => {
    if (!editor || !controlled) return;
    const current = editor.storage.markdown.getMarkdown();
    if (props.value !== current) editor.commands.setContent(props.value || "");
  }, [controlled, props.value, editor]);

  return (
    <div className="rounded border border-border-subtle overflow-hidden focus-within:ring-2 focus-within:ring-primary">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
      {!controlled && props.name && <input type="hidden" name={props.name} value={value} />}
    </div>
  );
}
```

- [ ] **Step 3: Editör stilleri — append `src/styles/app.css`**
```css
.tiptap { min-height: 8rem; max-height: 24rem; overflow-y: auto; padding: 0.75rem; font-size: 0.875rem; line-height: 1.5; color: #191c1f; }
.tiptap:focus { outline: none; }
.tiptap p { margin: 0 0 0.5rem; }
.tiptap p:last-child { margin-bottom: 0; }
.tiptap strong { font-weight: 700; }
.tiptap em { font-style: italic; }
.tiptap h2 { font-size: 1.05rem; font-weight: 600; margin: 0.75rem 0 0.4rem; }
.tiptap h3 { font-size: 1rem; font-weight: 600; margin: 0.6rem 0 0.3rem; }
.tiptap ul { list-style: disc; padding-left: 1.25rem; margin: 0 0 0.5rem; }
.tiptap ol { list-style: decimal; padding-left: 1.25rem; margin: 0 0 0.5rem; }
.tiptap blockquote { border-left: 3px solid #c2c7d1; padding-left: 0.75rem; color: #42474f; margin: 0 0 0.5rem; }
.tiptap code { background: #ededf3; padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.85em; }
.tiptap img { max-width: 100%; height: auto; border-radius: 6px; }
.tiptap a { color: #0F4C81; text-decoration: underline; }
/* Placeholder (extension-placeholder) */
.tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #727780; float: left; height: 0; pointer-events: none; }
```
Run `bun run build:css` to confirm compiles.

- [ ] **Step 4: Build gate + commit**
Run: `bun run build` → succeeds (RichTextEditor compiles; @uiw still present, used by MarkdownEditor which still exists). `bun test` → green (216). `bunx tsc --noEmit` → no NEW errors (the discriminated union should typecheck; fix if not — note the `content` init uses props.value/defaultValue).
```bash
git add src/client/components/RichTextEditor.tsx src/styles/app.css package.json bun.lock
git commit -m "feat: TipTap WYSIWYG RichTextEditor (markdown output)"
```

---

## Task 2: Swap call sites + remove @uiw + CSS cleanup

**Files:** Modify `src/client/pages/NewRequest.tsx`, `src/client/components/ReplyForm.tsx`, `src/client/components/AdminControls.tsx`; Delete `src/client/components/MarkdownEditor.tsx`; Modify `package.json`, `src/index.ts`, `src/client/index.html`.

- [ ] **Step 1: NewRequest (description, expected_benefit)**
In `src/client/pages/NewRequest.tsx`: change `import { MarkdownEditor } from "../components/MarkdownEditor";` → `import { RichTextEditor } from "../components/RichTextEditor";`. Replace the two `<MarkdownEditor name="description" .../>` and `<MarkdownEditor name="expected_benefit" .../>` with `<RichTextEditor .../>` (same props). After success NewRequest navigates away → no reset needed.

- [ ] **Step 2: ReplyForm (body) + reset-on-success**
In `src/client/components/ReplyForm.tsx`: swap import + `<MarkdownEditor name="body" .../>` → `<RichTextEditor name="body" .../>`. Because the editor's value lives in component state (not the native form), `formRef.current.reset()` won't clear it — remount to clear: add `const [rtkey, setRtKey] = useState(0);`, give the editor `key={rtkey}`, and after a successful submit call `setRtKey((k) => k + 1)` (alongside the existing reset/onSuccess). Verify `useState` is imported.

- [ ] **Step 3: AdminControls (message body + reject reason)**
In `src/client/components/AdminControls.tsx`: swap import. 
- Message body: `<MarkdownEditor name="body" .../>` → `<RichTextEditor name="body" .../>`; add the same `key` remount-on-success pattern as ReplyForm (message form clears after sending).
- Reject reason (controlled `value={rejectReason} onChange={setRejectReason}`): `<MarkdownEditor value=... onChange=.../>` → `<RichTextEditor value={rejectReason} onChange={setRejectReason} required maxLength={2000} />`. The existing `setRejectReason("")` after submit + RichTextEditor's controlled `useEffect` clears the editor.

- [ ] **Step 4: Delete MarkdownEditor + remove @uiw dep**
`git rm src/client/components/MarkdownEditor.tsx`. 
Run: `grep -rn "MarkdownEditor\|@uiw" src` → must be empty (no refs). 
Run: `bun remove @uiw/react-md-editor`.

- [ ] **Step 5: CSS-serve machinery cleanup**
- `package.json`: remove `--loader .css:text` from `build:client` and `dev:client` (no transitive CSS import once @uiw is gone). Remove the `build:editorcss` script and drop it from the `build` chain (`build` = `build:css && build:client && build:html`).
- `src/index.ts`: remove the `const mdEditorCss = Bun.file(...)` line and the `"/md-editor.css": mdEditorCss` route entry.
- `src/client/index.html`: remove `<link rel="stylesheet" href="/md-editor.css" />`.
- `rm -f public/md-editor.css` (stale artifact; it's gitignored anyway).

- [ ] **Step 6: Build + tests + commit**
Run: `bun run build` → succeeds (no @uiw, no md-editor.css, no --loader needed). `bun test` → green (216 — MarkdownView tests unaffected). `bunx tsc --noEmit` → no NEW errors. `grep -rn "md-editor.css\|@uiw\|MarkdownEditor" src` → empty.
```bash
git add -A
git commit -m "feat: swap to TipTap editor; remove @uiw md-editor + css machinery"
```

---

## Task 3: Final verification + visual

**Files:** (none — verification)

- [ ] **Step 1: Full test + build**
Run: `bun test` → all green (216). `bun run build` → succeeds. Confirm `public/` has no `md-editor.css` and index.html doesn't link it.

- [ ] **Step 2: Visual smoke (seeded server + admin cookie)**
Start server (fresh seed with departments). Verify in browser:
- New Talep formunda Açıklama/Beklenen Fayda **WYSIWYG**: toolbar'dan Kalın'a basıp yazınca **anında kalın** görünür (markdown sözdizimi YOK); liste/başlık/alıntı çalışır; "Bağlantı" → URL sorar, `javascript:` reddedilir.
- Talep oluştur (kalın + liste + link + görsel) → detayda (`MarkdownView`) doğru render.
- Thread'de admin sorusu / cevap WYSIWYG yazılır, detayda render olur.
- Reddet dialog'unda gerekçe editörü WYSIWYG; gönderince temizlenir.
- Cevap/soru gönderince editör temizlenir (key remount).
- **Güvenlik:** linke `javascript:alert(1)` girilmeye çalışılınca engellenir; (ayrıca MD1 testi render'da `javascript:`/`<script>` strip'i garanti eder).

- [ ] **Step 3: finishing-a-development-branch**
Use `superpowers:finishing-a-development-branch`.

---

## Self-Review Notları
- **Spec kapsamı:** §3 deps→Task1/2; §4 RichTextEditor→Task1; §5 stil→Task1; §6 MD2 temizliği→Task2; §7 kullanım yerleri→Task2; §8 test→Task1/3. Tümü karşılanıyor.
- **API uyumu:** RichTextEditor, MarkdownEditor ile birebir aynı prop imzası (controlled/uncontrolled) → 5 çağrı yeri yalnız import+isim ( + reply/message reset key) değişir.
- **Reset davranışı:** uncontrolled alanlar form.reset ile temizlenmiyordu (state'te) → ReplyForm/AdminControls-message `key` remount ile temizlenir; reject reason controlled useEffect ile.
- **Görüntüleme + güvenlik:** MarkdownView ve MD1 testleri DEĞİŞMEZ; editör yalnız markdown üretir; `javascript:` hem toolbar'da hem render'da (MD1) engellenir. Backend dokunulmaz.
- **Build:** @uiw + `--loader .css:text` + `build:editorcss` + `/md-editor.css` tamamen kaldırılır; build sadeleşir.
- **Risk:** tiptap-markdown ↔ TipTap sürüm uyumu Task1'de kurulumda doğrulanır; `editor.storage.markdown.getMarkdown()` API'si tiptap-markdown'ın standardı.
