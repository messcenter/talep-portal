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
import { type RequestStatus } from "../../domain/status";
import { RichTextEditor } from "./RichTextEditor";
import { FilePicker } from "./FilePicker";
import { useToast } from "./Toast";

export type AdminAction = "clarify" | "accept" | "reject" | "start" | "complete" | "cancel";

export function adminActionsFor(status: RequestStatus): AdminAction[] {
  switch (status) {
    case "new":
    case "clarifying":
    case "answered":
      return ["clarify", "accept", "reject"];
    case "accepted":
      return ["start", "complete", "cancel"];
    case "in_progress":
      return ["complete", "cancel"];
    default:
      return [];
  }
}

// ---- Clarification message form ----

function ClarificationForm({
  requestId,
  onDone,
}: {
  requestId: number;
  onDone: () => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const [files, setFiles] = useState<File[]>([]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;

    setSubmitting(true);
    setErrorMsg(null);

    const fd = new FormData(formRef.current);
    for (const f of files) fd.append("files", f);

    const body = ((fd.get("body") as string) ?? "").trim();
    if (!body) { setErrorMsg("Soru gerekli"); setSubmitting(false); return; }

    try {
      await apiSend(`/api/admin/requests/${requestId}/message`, "POST", fd);
      formRef.current.reset();
      setFiles([]);
      setEditorKey((k) => k + 1);
      toast.show("Soru eklendi.");
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
          <FilePicker value={files} onChange={setFiles} disabled={submitting} />
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
  const toast = useToast();
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
      toast.show("Karar kaydedildi.");
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

// ---- Post-acceptance progress (start / complete / cancel) ----

function ProgressForm({
  requestId,
  status,
  onDone,
}: {
  requestId: number;
  status: RequestStatus;
  onDone: () => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);

  async function send(decision: "start" | "complete" | "cancel", reason?: string) {
    setSubmitting(true);
    setErrorMsg(null);
    const fd = new FormData();
    fd.set("decision", decision);
    if (reason !== undefined) fd.set("reason", reason);
    try {
      await apiSend(`/api/admin/requests/${requestId}/decision`, "POST", fd);
      setCancelOpen(false);
      setCancelReason("");
      toast.show("Durum güncellendi.");
      onDone();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.");
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant mb-3">
        Durum
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
        {status === "accepted" && (
          <Button type="button" variant="primary" size="md" disabled={submitting}
            onClick={() => send("start")}>
            Geliştirmeye başla
          </Button>
        )}

        <Button type="button" variant="success" size="md" disabled={submitting}
          onClick={() => send("complete")}>
          Tamamlandı
        </Button>

        <Dialog
          open={cancelOpen}
          onOpenChange={(open) => { setCancelOpen(open); if (open) setErrorMsg(null); }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="danger" size="md" disabled={submitting}>
              İptal et
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle className="text-base font-semibold text-on-surface mb-3">
              Talebi iptal et
            </DialogTitle>
            <label className="block text-sm font-medium text-on-surface mb-1">
              İptal gerekçesi
            </label>
            <div className="mb-4">
              <RichTextEditor value={cancelReason} onChange={setCancelReason} required maxLength={2000} />
            </div>
            {errorMsg && <p className="text-danger text-xs mb-2" role="alert">{errorMsg}</p>}
            <div className="flex justify-end gap-3">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="md" disabled={submitting}>
                  Vazgeç
                </Button>
              </DialogClose>
              <Button type="button" variant="danger" size="md" disabled={submitting}
                onClick={() => {
                  if (!cancelReason.trim()) { setErrorMsg("İptal gerekçesi gerekli"); return; }
                  send("cancel", cancelReason);
                }}>
                {submitting ? "Gönderiliyor…" : "İptal et"}
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
  const actions = adminActionsFor(status);

  if (actions.length === 0) {
    return (
      <div className="mt-6 border-t border-border-subtle pt-4 text-sm text-on-surface-variant">
        Bu talep kapalı.
      </div>
    );
  }

  // pre-decision (new/clarifying/answered): clarify + accept/reject
  if (actions.includes("clarify")) {
    return (
      <div className="mt-6 border-t border-border-subtle pt-6 flex flex-col gap-4">
        <ClarificationForm requestId={requestId} onDone={onDone} />
        <DecisionForm requestId={requestId} onDone={onDone} />
      </div>
    );
  }

  // post-acceptance (accepted/in_progress): start/complete/cancel
  return (
    <div className="mt-6 border-t border-border-subtle pt-6 flex flex-col gap-4">
      <ProgressForm requestId={requestId} status={status} onDone={onDone} />
    </div>
  );
}
