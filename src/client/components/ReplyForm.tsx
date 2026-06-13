import { useState, useRef } from "react";
import { apiSend } from "../api";
import { Button } from "../../components/ui/button";
import { fileInputClass, fileAccept } from "./forms";
import { RichTextEditor } from "./RichTextEditor";

// ---- Reply form (requester only, status === "clarifying") ----

export function ReplyForm({
  requestId,
  onSuccess,
}: {
  requestId: number;
  onSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;

    setSubmitting(true);
    setErrorMsg(null);

    const fd = new FormData(formRef.current);

    try {
      await apiSend(`/api/requests/${requestId}/reply`, "POST", fd);
      formRef.current.reset();
      setEditorKey((k) => k + 1);
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.";
      // Surface 403 distinctly
      if (msg === "HTTP 403" || msg.includes("403")) {
        setErrorMsg("Bu talebe şu anda cevap verme izniniz yok.");
      } else {
        setErrorMsg(msg);
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant mb-3">
        Cevapla
      </h2>

      {errorMsg && (
        <div
          role="alert"
          className="mb-4 bg-danger/10 border border-danger/30 text-danger rounded p-3 text-sm"
        >
          {errorMsg}
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} noValidate>
        <div className="mb-3">
          <RichTextEditor
            key={editorKey}
            name="body"
            required
            maxLength={5000}
            placeholder="Cevabınızı buraya yazın…"
          />
        </div>

        <div className="mb-4">
          <input
            name="files"
            type="file"
            multiple
            accept={fileAccept}
            className={fileInputClass}
            disabled={submitting}
          />
          <p className="text-xs text-on-surface-variant mt-1">
            PNG, JPEG, WebP, GIF veya PDF · İsteğe bağlı
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
            {submitting ? "Gönderiliyor…" : "Cevapla"}
          </Button>
        </div>
      </form>
    </div>
  );
}
