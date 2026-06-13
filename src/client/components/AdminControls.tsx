// src/client/components/AdminControls.tsx
// Admin-only controls on the request detail page: clarification message form +
// accept/reject decision (reject behind a confirmation dialog).
import { useState, useRef } from "react";
import { apiSend } from "../api";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
  DialogTitle,
} from "../../components/ui/dialog";
import { isTerminal, type RequestStatus } from "../../domain/status";
import { RichTextEditor } from "./RichTextEditor";

const fileInputClass =
  "block w-full text-sm text-on-surface-variant " +
  "file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-border-subtle " +
  "file:text-xs file:font-semibold file:uppercase file:tracking-wide " +
  "file:text-on-surface-variant file:bg-surface-tonal file:cursor-pointer " +
  "hover:file:bg-surface-container disabled:opacity-50";

// ---- Clarification message form ----

function ClarificationForm({
  requestId,
  onDone,
}: {
  requestId: number;
  onDone: () => void;
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

    const body = ((fd.get("body") as string) ?? "").trim();
    if (!body) { setErrorMsg("Soru gerekli"); setSubmitting(false); return; }

    try {
      await apiSend(`/api/admin/requests/${requestId}/message`, "POST", fd);
      formRef.current.reset();
      setEditorKey((k) => k + 1);
      onDone();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant mb-3">
        Netleştirme sorusu
      </h3>

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
            placeholder="Netleştirme sorusu…"
          />
        </div>

        <div className="mb-4">
          <input
            name="files"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            className={fileInputClass}
            disabled={submitting}
          />
          <p className="text-xs text-on-surface-variant mt-1">
            PNG, JPEG, WebP, GIF veya PDF · İsteğe bağlı
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
            {submitting ? "Gönderiliyor…" : "Soru ekle"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---- Decision (accept / reject) ----

function DecisionForm({
  requestId,
  onDone,
}: {
  requestId: number;
  onDone: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);

  async function decide(decision: "accept" | "reject", reason?: string) {
    setSubmitting(true);
    setErrorMsg(null);
    const fd = new FormData();
    fd.set("decision", decision);
    if (reason !== undefined) fd.set("reason", reason);
    try {
      await apiSend(`/api/admin/requests/${requestId}/decision`, "POST", fd);
      setRejectOpen(false);
      setRejectReason("");
      onDone();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant mb-3">
        Karar
      </h3>

      {errorMsg && (
        <div
          role="alert"
          className="mb-4 bg-danger/10 border border-danger/30 text-danger rounded p-3 text-sm"
        >
          {errorMsg}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="success"
          size="md"
          disabled={submitting}
          onClick={() => decide("accept")}
        >
          Kabul et
        </Button>

        <Dialog
          open={rejectOpen}
          onOpenChange={(open) => {
            setRejectOpen(open);
            if (open) setErrorMsg(null);
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="danger" size="md" disabled={submitting}>
              Reddet
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle className="text-base font-semibold text-on-surface mb-3">
              Talebi reddet
            </DialogTitle>

            <label className="block text-sm font-medium text-on-surface mb-1">
              Ret gerekçesi
            </label>
            <div className="mb-4">
              <RichTextEditor
                value={rejectReason}
                onChange={setRejectReason}
                required
                maxLength={2000}
              />
            </div>

            {errorMsg && (
              <p className="text-danger text-xs mb-2" role="alert">{errorMsg}</p>
            )}

            <div className="flex justify-end gap-3">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="md" disabled={submitting}>
                  Vazgeç
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="danger"
                size="md"
                disabled={submitting}
                onClick={() => {
                  if (!rejectReason.trim()) { setErrorMsg("Ret gerekçesi gerekli"); return; }
                  decide("reject", rejectReason);
                }}
              >
                {submitting ? "Gönderiliyor…" : "Reddet"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}

// ---- Wrapper ----

export function AdminControls({
  requestId,
  status,
  onDone,
}: {
  requestId: number;
  status: RequestStatus;
  onDone: () => void;
}) {
  if (isTerminal(status)) {
    return (
      <div className="mt-6 border-t border-border-subtle pt-4 text-sm text-on-surface-variant">
        Bu talep kapalı.
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-border-subtle pt-6 flex flex-col gap-4">
      <ClarificationForm requestId={requestId} onDone={onDone} />
      <DecisionForm requestId={requestId} onDone={onDone} />
    </div>
  );
}
