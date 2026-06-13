// src/client/components/ConfirmDialog.tsx
// Reusable destructive-action confirmation built on the shadcn/Radix Dialog.
import { Dialog, DialogContent, DialogTitle, DialogClose } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "Sil",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-base font-semibold text-on-surface mb-2">
          {title}
        </DialogTitle>
        <p className="text-sm text-on-surface-variant mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="secondary" size="sm">
              İptal
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
