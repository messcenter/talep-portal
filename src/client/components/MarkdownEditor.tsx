// src/client/components/MarkdownEditor.tsx
// Toolbar markdown editor (@uiw/react-md-editor) for request/reply/admin text
// fields. Supports two modes:
//   - controlled:   value + onChange (parent owns the state)
//   - uncontrolled: name + defaultValue, with a hidden <input> so the value is
//                   captured by `new FormData(formRef.current)` on submit.
// Preview is sanitized via rehype-sanitize (XSS defense, mirrors MarkdownView).
import { useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import rehypeSanitize from "rehype-sanitize";

type Common = { maxLength?: number; required?: boolean; height?: number; placeholder?: string };
type Controlled = Common & { value: string; onChange: (v: string) => void; name?: undefined; defaultValue?: undefined };
type Uncontrolled = Common & { name: string; defaultValue?: string; value?: undefined; onChange?: undefined };

export function MarkdownEditor(props: Controlled | Uncontrolled) {
  const { maxLength, required, height = 200, placeholder } = props;
  const controlled = props.value !== undefined;
  const [internal, setInternal] = useState(controlled ? "" : (props.defaultValue ?? ""));
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
      {!controlled && props.name && <input type="hidden" name={props.name} value={value} />}
    </div>
  );
}
