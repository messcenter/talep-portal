# Yeni Talep Formu Görsel Cila — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `NewRequest.tsx` formunu, davranışı değiştirmeden, üç bölümlü ("Kapsam / Sınıflandırma / Talep Detayı") rafine bir kart haline getirmek ve çıplak dosya input'unu sürükle-bırak destekli görsel bir bırakma alanına dönüştürmek.

**Architecture:** Salt görsel yeniden yapılandırma + tek küçük etkileşim eklemesi. Dosya seçimi/önizleme mantığının saf (React'siz) kısmı `fileList.ts`'e çıkarılıp birim test edilir; etkileşim `FileDropField.tsx` bileşeninde toplanır. Bileşen, gizli bir native `<input type="file" name="files">`'in `files` özelliğini state ile senkron tutar; böylece üst formdaki `new FormData(formRef.current)` gönderimi **değişmeden** çalışır. Test deseni mevcut repo ile aynı: `bun:test` + saf birim test + `renderToStaticMarkup` SSR kontrolü (jsdom yok).

**Tech Stack:** React 19, TypeScript, Tailwind, Bun (`bun:test`), `react-dom/server`.

---

## File Structure

- **Create** `src/client/components/fileList.ts` — saf yardımcılar: `formatFileSize`, `removeFileAt`. Zero React, zero I/O.
- **Create** `src/client/components/fileList.test.ts` — yukarıdakilerin birim testleri.
- **Create** `src/client/components/FileDropField.tsx` — sürükle-bırak + tıkla-seç dosya alanı. Tek sorumluluk: dosya seçimi/önizleme; dışa `name` + `disabled` prop'ları ile konuşur.
- **Create** `src/client/components/FileDropField.test.tsx` — SSR statik-render kontrolü.
- **Modify** `src/client/pages/NewRequest.tsx` — yerel `inputClass` kopyasını sil (`forms.ts`'ten import et); formu üç `<section>` + bölüm başlığı + ayraçlarla yeniden yapılandır; `Ekler` alanını `FileDropField` ile değiştir.

Mevcut `src/client/components/forms.ts` (`inputClass`, `fileAccept`) ve `src/components/ui/{card,button}.tsx` aynen kullanılır — değiştirilmez.

---

### Task 1: Saf dosya yardımcıları (`fileList.ts`)

**Files:**
- Create: `src/client/components/fileList.ts`
- Test: `src/client/components/fileList.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/client/components/fileList.test.ts
import { expect, test } from "bun:test";
import { formatFileSize, removeFileAt } from "./fileList";

test("formatFileSize: bytes under 1 KB", () => {
  expect(formatFileSize(512)).toBe("512 B");
});

test("formatFileSize: kilobytes with one decimal", () => {
  expect(formatFileSize(2048)).toBe("2.0 KB");
});

test("formatFileSize: megabytes with one decimal", () => {
  expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
});

test("removeFileAt: drops only the file at the given index", () => {
  const a = new File(["a"], "a.txt");
  const b = new File(["b"], "b.txt");
  const c = new File(["c"], "c.txt");
  const out = removeFileAt([a, b, c], 1);
  expect(out.map((f) => f.name)).toEqual(["a.txt", "c.txt"]);
});

test("removeFileAt: returns a new array, does not mutate input", () => {
  const a = new File(["a"], "a.txt");
  const input = [a];
  const out = removeFileAt(input, 0);
  expect(out).toEqual([]);
  expect(input.length).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/fileList.test.ts`
Expected: FAIL — `Cannot find module './fileList'` (modül henüz yok).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/client/components/fileList.ts
// Pure helpers for the FileDropField — no React, no I/O.

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function removeFileAt(files: File[], index: number): File[] {
  return files.filter((_, i) => i !== index);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/components/fileList.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/client/components/fileList.ts src/client/components/fileList.test.ts
git commit -m "feat: add pure file-list helpers for attachment field"
```

---

### Task 2: `FileDropField` bileşeni

**Files:**
- Create: `src/client/components/FileDropField.tsx`
- Test: `src/client/components/FileDropField.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/client/components/FileDropField.test.tsx
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FileDropField } from "./FileDropField";

test("FileDropField renders the drag-and-drop prompt", () => {
  const html = renderToStaticMarkup(<FileDropField name="files" />);
  expect(html).toContain("sürükleyin");
});

test("FileDropField renders the accepted-types hint", () => {
  const html = renderToStaticMarkup(<FileDropField name="files" />);
  expect(html).toContain("PDF");
});

test("FileDropField wires the given name onto the file input", () => {
  const html = renderToStaticMarkup(<FileDropField name="files" />);
  expect(html).toContain('name="files"');
  expect(html).toContain('type="file"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/FileDropField.test.tsx`
Expected: FAIL — `Cannot find module './FileDropField'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/components/FileDropField.test.tsx`
Expected: PASS (3 tests). (Not: `useEffect` SSR'da çalışmaz, bu yüzden `DataTransfer` testte gerekmez.)

- [ ] **Step 5: Commit**

```bash
git add src/client/components/FileDropField.tsx src/client/components/FileDropField.test.tsx
git commit -m "feat: add FileDropField drag-and-drop attachment component"
```

---

### Task 3: `NewRequest` formunu bölümlere ayır + `inputClass` dedupe

**Files:**
- Modify: `src/client/pages/NewRequest.tsx`

Bu task **salt görsel** — alanlar, alan adları, gönderim ve doğrulama aynen kalır. Yeni test yok; mevcut suite yeşil kalmalı.

- [ ] **Step 1: Yerel `inputClass`'ı kaldır, paylaşılanı import et**

`NewRequest.tsx` üst kısmındaki importlara ekle:

```tsx
import { inputClass } from "../components/forms";
import { FileDropField } from "../components/FileDropField";
```

Ardından dosyadaki yerel `const inputClass = "..."` bloğunu (forms.ts'tekiyle birebir aynı kopya) **tamamen sil**.

- [ ] **Step 2: `SectionHeading` yardımcı bileşenini ekle**

`FieldLabel`'in hemen altına ekle:

```tsx
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-primary mb-3">
      {children}
    </h2>
  );
}
```

- [ ] **Step 3: Form gövdesini üç `<section>`'a yeniden yapılandır**

`<form ref={formRef} onSubmit={handleSubmit} noValidate>` içeriğini aşağıdaki ile değiştir. (Alanların kendi içerikleri — `select`/`input`/`FieldLabel` — değişmez; yalnızca sarmalayıcı bölümler, başlıklar, ayraçlar ve dosya alanı değişir.)

```tsx
<form ref={formRef} onSubmit={handleSubmit} noValidate>
  {/* ---- Section 1: Kapsam ---- */}
  <section className="pb-5">
    <SectionHeading>Kapsam</SectionHeading>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <FieldLabel htmlFor="department" required>
          Departman
        </FieldLabel>
        <select
          id="department"
          name="department"
          required
          value={dept}
          onChange={(e) => {
            setDept(e.target.value);
            setModuleName("");
          }}
          className={inputClass}
          disabled={submitting}
        >
          <option value="">Seçiniz…</option>
          {depts.map((d) => (
            <option key={d.id} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <FieldLabel htmlFor="application" required>
          Uygulama
        </FieldLabel>
        <input
          id="application"
          name="application"
          type="text"
          required
          maxLength={120}
          defaultValue="ERP"
          placeholder="ör. ERP"
          className={inputClass}
          disabled={submitting}
        />
      </div>
    </div>

    {selectedDept && selectedDept.modules.length > 0 && (
      <div className="mt-4">
        <FieldLabel htmlFor="module_area">Modül / Alan</FieldLabel>
        <select
          id="module_area"
          name="module_area"
          value={moduleName}
          onChange={(e) => setModuleName(e.target.value)}
          className={inputClass}
          disabled={submitting}
        >
          <option value="">Seçiniz…</option>
          {selectedDept.modules.map((m) => (
            <option key={m.id} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
    )}
  </section>

  {/* ---- Section 2: Sınıflandırma ---- */}
  <section className="py-5 border-t border-border-subtle">
    <SectionHeading>Sınıflandırma</SectionHeading>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <FieldLabel htmlFor="request_type" required>
          Talep Türü
        </FieldLabel>
        <select
          id="request_type"
          name="request_type"
          required
          className={inputClass}
          disabled={submitting}
        >
          <option value="">Seçiniz…</option>
          <option value="feature">Yeni Özellik</option>
          <option value="bug">Hata</option>
          <option value="task">Görev</option>
        </select>
      </div>
      <div>
        <FieldLabel htmlFor="priority" required>
          Öncelik
        </FieldLabel>
        <select
          id="priority"
          name="priority"
          required
          className={inputClass}
          disabled={submitting}
        >
          <option value="">Seçiniz…</option>
          <option value="low">Düşük</option>
          <option value="medium">Orta</option>
          <option value="high">Yüksek</option>
        </select>
      </div>
    </div>
  </section>

  {/* ---- Section 3: Talep Detayı ---- */}
  <section className="pt-5 border-t border-border-subtle">
    <SectionHeading>Talep Detayı</SectionHeading>

    <div className="mb-4">
      <FieldLabel htmlFor="title" required>
        Başlık
      </FieldLabel>
      <input
        id="title"
        name="title"
        type="text"
        required
        maxLength={200}
        placeholder="Talebi özetleyen kısa bir başlık"
        className={inputClass}
        disabled={submitting}
      />
    </div>

    <div className="mb-4">
      <FieldLabel htmlFor="description" required>
        Açıklama
      </FieldLabel>
      <textarea
        id="description"
        name="description"
        required
        maxLength={5000}
        rows={5}
        placeholder="Talebi ayrıntılı olarak açıklayın."
        className={inputClass + " resize-y"}
        disabled={submitting}
      />
    </div>

    <div className="mb-4">
      <FieldLabel htmlFor="expected_benefit" required>
        Beklenen Fayda
      </FieldLabel>
      <textarea
        id="expected_benefit"
        name="expected_benefit"
        required
        maxLength={2000}
        rows={3}
        placeholder="Bu talep hayata geçirilirse ne kazanırız?"
        className={inputClass + " resize-y"}
        disabled={submitting}
      />
    </div>

    <div>
      <FieldLabel htmlFor="files">Ekler</FieldLabel>
      <FileDropField name="files" disabled={submitting} />
    </div>
  </section>

  {/* ---- Submit ---- */}
  <div className="flex justify-end pt-5 mt-5 border-t border-border-subtle">
    <Button type="submit" variant="primary" size="md" disabled={submitting}>
      {submitting ? "Gönderiliyor…" : "Talep Gönder"}
    </Button>
  </div>
</form>
```

- [ ] **Step 4: Tüm test suite'i çalıştır (regresyon yok)**

Run: `bun test`
Expected: PASS — tüm mevcut testler dahil yeşil. (Davranış değişmedi.)

- [ ] **Step 5: Build'in geçtiğini doğrula (tip + bundle)**

Run: `bun run build`
Expected: `build:css` ve `build:client` hatasız tamamlanır (TypeScript hatası yok).

- [ ] **Step 6: Commit**

```bash
git add src/client/pages/NewRequest.tsx
git commit -m "feat: restructure New Request form into sections + drop-zone attachments"
```

---

### Task 4: Manuel doğrulama (smoke)

**Files:** yok (yalnızca çalıştırma/gözlem).

- [ ] **Step 1: Sunucuyu başlat**

Run: `bun run dev`
Tarayıcıda `/yeni` adresini aç.

- [ ] **Step 2: Görsel kontrol**

Doğrula:
- Üç bölüm başlığı görünüyor: **Kapsam**, **Sınıflandırma**, **Talep Detayı**; aralarda ince ayraç var.
- Departman seçilince Modül/Alan alanı "Kapsam" bölümünde koşullu olarak beliriyor.
- Ekler alanı kesikli çerçeveli bırakma alanı olarak görünüyor.

- [ ] **Step 3: Dosya etkileşimini doğrula**

Doğrula:
- Bırakma alanına **tıklayınca** dosya seçici açılıyor; seçilen dosyalar boyutuyla listeleniyor.
- Bir dosyayı masaüstünden **sürükleyip bırakınca** alan vurgulanıyor ve dosya listeye ekleniyor.
- Bir dosyanın **×** düğmesi onu listeden kaldırıyor.

- [ ] **Step 4: Uçtan uca gönderim**

Tüm zorunlu alanları doldur, en az bir dosya ekle, **Talep Gönder**'e bas.
Doğrula: talep oluşuyor, `/requests/:id` detayına yönleniyor ve eklenen dosya(lar) ekler olarak görünüyor (mevcut `Attachments` bileşeni). Bu, `FileDropField`'in `FormData`'ya doğru yansıdığını kanıtlar.

---

## Self-Review Notları

- **Spec kapsamı:** Bölümleme (Task 3), ritim/boşluk (Task 3 — `space`/`border-t` ayraçları), sürükle-bırak ek alanı (Task 2+3), `inputClass` dedupe (Task 3) — hepsi karşılandı.
- **Kapsam dışı korundu:** alan ekleme/çıkarma yok, inline doğrulama yok, çok-sütun yok, `forms.ts` stili değişmedi, diğer ekranlara dokunulmadı.
- **Tip tutarlılığı:** `formatFileSize(bytes: number): string`, `removeFileAt(files: File[], index: number): File[]`, `FileDropField({ name, disabled })` — Task 1/2/3 boyunca aynı imzalarla kullanıldı.
- **Test gerçekçiliği:** jsdom olmadığından drag-drop teli birim test edilemez; saf mantık (`fileList.test.ts`) ve SSR render (`FileDropField.test.tsx`) test edilir, etkileşim Task 4'te manuel doğrulanır — repo deseniyle uyumlu.
