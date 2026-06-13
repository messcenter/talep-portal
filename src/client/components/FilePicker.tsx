// src/client/components/FilePicker.tsx
// Controlled multi-file picker. Owns a hidden native <input type=file> and
// surfaces the chosen File[] via value/onChange. The native FileList cannot be
// set programmatically, so the parent must read `value` and append to FormData
// on submit (the native input is intentionally not form-associated).
import { useRef, useId } from "react";
import { fileAccept } from "./forms";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function FilePicker({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    onChange([...value, ...Array.from(list)]);
    if (inputRef.current) inputRef.current.value = ""; // allow re-selecting same file
  }
  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={fileAccept}
        className="sr-only"
        id={inputId}
        disabled={disabled}
        onChange={(e) => addFiles(e.target.files)}
      />
      <label
        htmlFor={inputId}
        className={
          "inline-flex items-center gap-2 rounded border border-border-subtle bg-surface-tonal " +
          "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-on-surface-variant " +
          "cursor-pointer hover:bg-surface-container " +
          (disabled ? "opacity-50 pointer-events-none" : "")
        }
      >
        Dosya seç
      </label>

      {value.length === 0 ? (
        <p className="text-xs text-on-surface-variant mt-2">Dosya seçilmedi</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {value.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between gap-3 text-sm bg-surface-tonal border border-border-subtle rounded px-2.5 py-1.5"
            >
              <span className="truncate text-on-surface">{f.name}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-on-surface-variant">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  className="text-danger font-bold leading-none px-1"
                  aria-label={`${f.name} kaldır`}
                  disabled={disabled}
                  onClick={() => removeAt(i)}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
