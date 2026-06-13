import { useState, useEffect, useCallback } from "react";
import { apiGet } from "../api";
import type { AttachmentRow } from "../components/Attachments";
import type { MessageRow } from "../components/Thread";
import type { RequestRow } from "../components/RequestCard";

export interface DetailData {
  request: RequestRow;
  messages: MessageRow[];
  attachments: AttachmentRow[];
}

export function useRequestDetail(id: string | undefined) {
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    apiGet<DetailData>(`/api/requests/${id}`)
      .then(setData)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "404") setNotFound(true);
        else setError(msg);
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, notFound, load };
}
