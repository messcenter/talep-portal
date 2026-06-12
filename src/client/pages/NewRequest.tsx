// src/client/pages/NewRequest.tsx
// "Yeni Talep Formu" — creates a new ERP/software request.
// Field names exactly match newRequestSchema in src/domain/validation.ts.
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiSend } from "../api";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

type Dept = { id: number; name: string; modules: { id: number; name: string }[] };

// ---- Shared label component ----

function FieldLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-1"
    >
      {children}
      {required && <span className="text-danger ml-1">*</span>}
    </label>
  );
}

// ---- Shared input class ----

const inputClass =
  "block w-full rounded border border-border-subtle bg-white px-3 py-2 text-sm text-on-surface " +
  "placeholder:text-on-surface-variant/50 " +
  "focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary " +
  "disabled:opacity-50 disabled:bg-surface-tonal";

// ---- Main component ----

export function NewRequest() {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Managed department/module lists (DM5). Controlled selects.
  const [depts, setDepts] = useState<Dept[] | null>(null);
  const [dept, setDept] = useState("");
  const [moduleName, setModuleName] = useState("");

  useEffect(() => {
    apiGet<Dept[]>("/api/departments")
      .then(setDepts)
      .catch((err) =>
        setErrorMsg(err instanceof Error ? err.message : "Departmanlar yüklenemedi."),
      );
  }, []);

  const selectedDept = depts?.find((d) => d.name === dept);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;

    setSubmitting(true);
    setErrorMsg(null);

    const fd = new FormData(formRef.current);
    // Department/module are controlled state (not uncontrolled DOM inputs);
    // set them explicitly so the submitted field names/values are guaranteed.
    fd.set("department", dept);
    fd.set("module_area", moduleName);

    try {
      const result = await apiSend<{ id: number }>("/api/requests", "POST", fd);
      if (result) {
        navigate(`/requests/${result.id}`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.");
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-on-surface tracking-tight">
          Yeni Talep Oluştur
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Tüm zorunlu alanları doldurun. Talebiniz onaylanmadan önce netleştirme
          soruları sorulabilir.
        </p>
      </div>

      <Card className="p-6">
        {/* Error alert */}
        {errorMsg && (
          <div
            role="alert"
            className="mb-5 bg-danger/10 border border-danger/30 text-danger rounded p-3 text-sm"
          >
            {errorMsg}
          </div>
        )}

        {/* Still loading departments */}
        {!depts && !errorMsg && (
          <p className="text-on-surface-variant">Yükleniyor…</p>
        )}

        {/* No managed departments → cannot submit a valid request */}
        {depts && depts.length === 0 && (
          <div className="bg-surface-tonal border border-border-subtle rounded p-4 text-sm text-on-surface">
            Henüz departman tanımlanmamış. Lütfen yöneticiye başvurun.
          </div>
        )}

        {depts && depts.length > 0 && (
        <form ref={formRef} onSubmit={handleSubmit} noValidate>
          {/* Row 1: Department + Application (two-column on sm+) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
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

          {/* Row 2: Module Area (optional, scoped to selected department) */}
          {selectedDept && selectedDept.modules.length > 0 && (
            <div className="mb-4">
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

          {/* Row 3: Request Type + Priority (two-column on sm+) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
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

          {/* Row 4: Title */}
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

          {/* Row 5: Description */}
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

          {/* Row 6: Expected Benefit */}
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

          {/* Row 7: File Attachments (optional) */}
          <div className="mb-6">
            <FieldLabel htmlFor="files">Ekler</FieldLabel>
            <input
              id="files"
              name="files"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
              className={
                "block w-full text-sm text-on-surface-variant " +
                "file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-border-subtle " +
                "file:text-xs file:font-semibold file:uppercase file:tracking-wide " +
                "file:text-on-surface-variant file:bg-surface-tonal file:cursor-pointer " +
                "hover:file:bg-surface-container disabled:opacity-50"
              }
              disabled={submitting}
            />
            <p className="text-xs text-on-surface-variant mt-1">
              PNG, JPEG, WebP, GIF veya PDF · Birden fazla dosya seçilebilir
            </p>
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="md" disabled={submitting}>
              {submitting ? "Gönderiliyor…" : "Talep Gönder"}
            </Button>
          </div>
        </form>
        )}
      </Card>
    </main>
  );
}
