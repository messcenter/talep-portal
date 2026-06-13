// src/client/components/RichTextEditor.tsx
// WYSIWYG rich-text editor (TipTap). Value is markdown (tiptap-markdown), so the
// existing react-markdown display + its security tests are reused unchanged.
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import { useState, useEffect } from "react";

type Common = { required?: boolean; maxLength?: number; placeholder?: string };
type Controlled = Common & { value: string; onChange: (v: string) => void; name?: undefined; defaultValue?: undefined };
type Uncontrolled = Common & { name: string; defaultValue?: string; value?: undefined; onChange?: undefined };

const isHttp = (u: string) => /^https?:\/\//i.test(u);
const getMd = (editor: Editor) => (editor.storage.markdown as MarkdownStorage).getMarkdown();

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
    immediatelyRender: false,
    extensions: [
      // StarterKit v3 bundles its own Link; disable it so our explicit config wins
      // (avoids the "Duplicate extension names: ['link']" warning).
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false, autolink: true, protocols: ["http", "https"] }),
      Image,
      Placeholder.configure({ placeholder: props.placeholder ?? "Yazın…" }),
      Markdown,
    ],
    content: controlled ? (props.value ?? "") : (props.defaultValue ?? ""),
    onUpdate: ({ editor }) => setValue(getMd(editor)),
    editorProps: { attributes: { class: "tiptap focus:outline-none" } },
  });

  // Controlled external resets (e.g. reject reason cleared to "") sync into the editor.
  useEffect(() => {
    if (!editor || !controlled) return;
    const current = getMd(editor);
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
