// src/domain/export.ts
// Pure formatter: a single request → a Markdown document. Zero I/O.
import { type RequestStatus, statusLabelTr } from "./status";

export interface ExportRequest {
  request_no: string;
  title: string;
  status: RequestStatus;
  priority: string;
  request_type: string;
  department: string;
  application: string;
  module_area: string | null;
  requester_name: string;
  requester_email: string;
  created_at: string;
  description: string;
  expected_benefit: string;
}

export interface ExportMessage {
  author_role: "admin" | "requester";
  body: string;
  created_at: string;
}

export interface ExportAttachment {
  original_name: string;
}

// Turkish labels. Priority/type maps live here (domain may not import the
// client labels.ts; small, stable duplication is accepted — see design doc).
const PRIORITY_LABEL_TR: Record<string, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
};

const REQUEST_TYPE_LABEL_TR: Record<string, string> = {
  feature: "Yeni Özellik",
  bug: "Hata",
  task: "Görev",
};

const ROLE_LABEL_TR: Record<ExportMessage["author_role"], string> = {
  admin: "Yönetici",
  requester: "Talep eden",
};

/** Collapse newlines to spaces (for single-line contexts like the H1). */
function inlineText(s: string): string {
  return s.replace(/\r?\n/g, " ").trim();
}

/** Escape a value for a Markdown table cell: no newlines, escaped pipes. */
function cell(s: string): string {
  return inlineText(s).replace(/\|/g, "\\|");
}

export function requestToMarkdown(data: {
  request: ExportRequest;
  messages: ExportMessage[];
  attachments: ExportAttachment[];
}): string {
  const { request: r, messages, attachments } = data;

  const lines: string[] = [];
  lines.push(`# ${r.request_no} · ${inlineText(r.title)}`);
  lines.push("");
  lines.push("| Alan | Değer |");
  lines.push("|---|---|");
  lines.push(`| Durum | ${cell(statusLabelTr(r.status))} |`);
  lines.push(`| Öncelik | ${cell(PRIORITY_LABEL_TR[r.priority] ?? r.priority)} |`);
  lines.push(`| Tür | ${cell(REQUEST_TYPE_LABEL_TR[r.request_type] ?? r.request_type)} |`);
  lines.push(`| Departman | ${cell(r.department)} |`);
  lines.push(`| Uygulama | ${cell(r.application)} |`);
  lines.push(`| Modül / Alan | ${r.module_area ? cell(r.module_area) : "—"} |`);
  lines.push(`| Talep eden | ${cell(`${r.requester_name} (${r.requester_email})`)} |`);
  lines.push(`| Oluşturma | ${cell(r.created_at)} |`);
  lines.push("");
  lines.push("## Açıklama");
  lines.push("");
  lines.push(r.description);
  lines.push("");
  lines.push("## Beklenen Fayda");
  lines.push("");
  lines.push(r.expected_benefit);
  lines.push("");
  lines.push("## Yazışma");
  lines.push("");
  if (messages.length === 0) {
    lines.push("_Henüz mesaj yok._");
  } else {
    messages.forEach((m, i) => {
      lines.push(`### ${ROLE_LABEL_TR[m.author_role]} · ${m.created_at}`);
      lines.push("");
      lines.push(m.body);
      if (i < messages.length - 1) lines.push("");
    });
  }
  lines.push("");
  lines.push("## Ekler");
  lines.push("");
  if (attachments.length === 0) {
    lines.push("_Ek yok._");
  } else {
    for (const a of attachments) lines.push(`- ${a.original_name}`);
  }
  lines.push("");

  return lines.join("\n");
}
