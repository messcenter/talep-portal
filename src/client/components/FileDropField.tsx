// src/client/components/FileDropField.tsx
// Visual drop zone for attachments: click-to-select + drag-and-drop.
// Keeps a hidden native <input type="file" name={name}> in sync with React
// state so the parent form's FormData(formRef) submits exactly these files.
// No network I/O.
import { useRef, useState, useEffect } from "react";
import { fileAccept } from "./forms";
import { formatFileSize, removeFileAt } from "./fileList";

export function FileDropField({
  name,
  disabled = false,
}: {
  name: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);

  // Mirror state into the hidden native input so FormData picks it up.
  // Programmatically setting input.files does NOT fire a change event,
  // so there is no feedback loop with onPicked.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    input.files = dt.files;
  }, [files]);

  function openPicker() {
    if (!disabled) inputRef.current?.click();
  }

  function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    if (picked.length) setFiles((prev) => [...prev, ...picked]);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) setFiles((prev) => [...prev, ...dropped]);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  }

  const zoneClass = [
    "flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed",
    "px-4 py-6 text-center cursor-pointer transition-colors",
    dragging
      ? "border-primary bg-surface-tonal"
      : "border-border-subtle hover:bg-surface-tonal",
    disabled ? "opacity-50 pointer-events-none" : "",
  ].join(" ");

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Dosya seçin veya sürükleyip bırakın"
        className={zoneClass}
        onClick={openPicker}
        onKeyDown={onKeyDown}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <svg
          className="h-6 w-6 text-on-surface-variant"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
          />
        </svg>
        <span className="text-sm text-on-surface">
          Dosyaları buraya{" "}
          <span className="text-primary font-medium">sürükleyin</span> veya{" "}
          <span className="text-primary font-medium">seçin</span>
        </span>
        <span className="text-xs text-on-surface-variant">
          PNG, JPEG, WebP, GIF veya PDF · Birden fazla dosya seçilebilir
        </span>
      </div>

      <input
        ref={inputRef}
        id={name}
        name={name}
        type="file"
        multiple
        accept={fileAccept}
        onChange={onPicked}
        disabled={disabled}
        className="hidden"
      />

      {files.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${f.size}-${i}`}
              className="flex items-center justify-between gap-2 rounded border border-border-subtle bg-white px-3 py-1.5 text-sm"
            >
              <span className="truncate text-on-surface">{f.name}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-on-surface-variant">
                  {formatFileSize(f.size)}
                </span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => removeFileAt(prev, i))}
                  disabled={disabled}
                  aria-label={`${f.name} dosyasını kaldır`}
                  className="text-on-surface-variant hover:text-danger leading-none px-1"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
