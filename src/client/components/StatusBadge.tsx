import { statusLabelTr, type RequestStatus } from "../../domain/status";
import { Badge } from "../../components/ui/badge";

const TINT: Record<RequestStatus, string> = {
  new: "bg-status-yeni/10 text-status-yeni",
  clarifying: "bg-status-netlestiriliyor/10 text-status-netlestiriliyor",
  answered: "bg-status-netlestiriliyor/10 text-status-netlestiriliyor",
  accepted: "bg-status-kabul/10 text-status-kabul",
  rejected: "bg-status-ret/10 text-status-ret",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <Badge className={TINT[status]}>{statusLabelTr(status)}</Badge>;
}
