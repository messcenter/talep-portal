// src/mail/templates.ts — branded, inline-CSS notification email templates.
import type { RequestRow } from "../db/repo";

export interface Mail {
  subject: string;
  html: string;
  text: string;
}

const PRIMARY = "#0F4C81";

/** Turkish labels for non-silent decision targets (in_progress is intentionally absent). */
const DECISION_LABEL_TR: Record<"accepted" | "rejected" | "done" | "cancelled", string> = {
  accepted: "kabul edildi",
  rejected: "reddedildi",
  done: "tamamlandı",
  cancelled: "iptal edildi",
};

/** Shared HTML + text "Not:" block for an optional decision reason. */
function reasonBlock(reason?: string): { html: string; text: string } {
  if (!reason) return { html: "", text: "" };
  return {
    html: `<p style="margin:0 0 16px;"><strong>Not:</strong> ${esc(reason)}</p>`,
    text: `\nNot: ${reason}`,
  };
}

// Small local HTML-escape (kept here to avoid src/mail depending on src/server).
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailLayout(opts: { heading: string; bodyHtml: string; ctaText?: string; ctaUrl?: string }): string {
  const { heading, bodyHtml, ctaText, ctaUrl } = opts;
  const button =
    ctaText && ctaUrl
      ? `<tr><td style="padding:8px 0 4px;">
            <a href="${ctaUrl}" style="display:inline-block;background:${PRIMARY};color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:10px 20px;border-radius:4px;font-family:Arial,Helvetica,sans-serif;">${esc(ctaText)}</a>
          </td></tr>`
      : "";
  return `<!doctype html><html lang="tr"><body style="margin:0;padding:0;background:#f3f3f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f3f8;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
      <tr><td style="background:${PRIMARY};padding:16px 24px;">
        <span style="color:#ffffff;font-size:16px;font-weight:bold;">Talep Portalı</span>
      </td></tr>
      <tr><td style="padding:24px;">
        <h1 style="margin:0 0 12px;font-size:18px;color:#191c1f;">${esc(heading)}</h1>
        <div style="font-size:14px;line-height:22px;color:#42474f;">${bodyHtml}</div>
        <table role="presentation" cellpadding="0" cellspacing="0">${button}</table>
      </td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid #E2E8F0;">
        <span style="font-size:12px;color:#727780;">Bu e-posta Talep Portalı tarafından otomatik gönderildi.</span>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export function newRequestAdmin(r: RequestRow, baseUrl: string): Mail {
  const url = `${baseUrl}/admin/requests/${r.id}`;
  return {
    subject: `Yeni talep: ${r.request_no}`,
    html: emailLayout({
      heading: "Yeni talep",
      bodyHtml: `<p style="margin:0 0 16px;"><strong>${esc(r.request_no)}</strong> — ${esc(r.title)} adlı yeni bir talep oluşturuldu.</p>`,
      ctaText: "İncele",
      ctaUrl: url,
    }),
    text: `Yeni talep: ${r.request_no} — ${r.title}\nİncele: ${url}`,
  };
}

export function newRequestRequester(r: RequestRow, baseUrl: string): Mail {
  const url = `${baseUrl}/requests/${r.id}`;
  return {
    subject: `Talebiniz alındı: ${r.request_no}`,
    html: emailLayout({
      heading: "Talebiniz alındı",
      bodyHtml: `<p style="margin:0 0 16px;"><strong>${esc(r.request_no)}</strong> numaralı talebiniz alındı. Süreci aşağıdaki bağlantıdan takip edebilirsiniz.</p>`,
      ctaText: "Talebi görüntüle",
      ctaUrl: url,
    }),
    text: `Talebiniz alındı: ${r.request_no}\nTakip: ${url}`,
  };
}

export function replyAdmin(r: RequestRow, baseUrl: string): Mail {
  const url = `${baseUrl}/admin/requests/${r.id}`;
  return {
    subject: `Cevaplandı: ${r.request_no}`,
    html: emailLayout({
      heading: "Talep cevaplandı",
      bodyHtml: `<p style="margin:0 0 16px;"><strong>${esc(r.request_no)}</strong> talebine cevap verildi.</p>`,
      ctaText: "İncele",
      ctaUrl: url,
    }),
    text: `Cevaplandı: ${r.request_no}\nİncele: ${url}`,
  };
}

export function questionRequester(r: RequestRow, baseUrl: string): Mail {
  const url = `${baseUrl}/requests/${r.id}`;
  return {
    subject: `Talebiniz hakkında soru: ${r.request_no}`,
    html: emailLayout({
      heading: "Talebiniz hakkında soru var",
      bodyHtml: `<p style="margin:0 0 16px;"><strong>${esc(r.request_no)}</strong> talebinizle ilgili netleştirme soruları var. Lütfen cevaplayın.</p>`,
      ctaText: "Cevapla",
      ctaUrl: url,
    }),
    text: `Talebiniz hakkında soru: ${r.request_no}\nCevapla: ${url}`,
  };
}

export function decisionRequester(
  r: RequestRow,
  baseUrl: string,
  target: "accepted" | "rejected" | "done" | "cancelled",
  reason?: string,
): Mail {
  const url = `${baseUrl}/requests/${r.id}`;
  const label = DECISION_LABEL_TR[target];
  const rb = reasonBlock(reason);
  return {
    subject: `Talep ${label}: ${r.request_no}`,
    html: emailLayout({
      heading: `Talep ${label}`,
      bodyHtml: `<p style="margin:0 0 16px;"><strong>${esc(r.request_no)}</strong> talebiniz ${label}.</p>` + rb.html,
      ctaText: "Talebi görüntüle",
      ctaUrl: url,
    }),
    text: `Talep ${label}: ${r.request_no}${rb.text}\nGörüntüle: ${url}`,
  };
}

function detailUrl(
  baseUrl: string,
  id: number,
  audience: "requester" | "admin" | "subscriber",
): string {
  return audience === "admin"
    ? `${baseUrl}/admin/requests/${id}`
    : `${baseUrl}/requests/${id}`;
}

/** Neutral "a message was added" notice for subscribers. */
export function subscriberMessage(
  r: RequestRow,
  baseUrl: string,
  byName: string,
  authorRole: "admin" | "requester",
): Mail {
  const url = detailUrl(baseUrl, r.id, "subscriber");
  const roleTr = authorRole === "admin" ? "yönetici" : "talep sahibi";
  return {
    subject: `Güncelleme: ${r.request_no}`,
    html: emailLayout({
      heading: "Takip ettiğiniz talepte güncelleme var",
      bodyHtml: `<p style="margin:0 0 16px;"><strong>${esc(r.request_no)}</strong> — ${esc(r.title)} talebine ${esc(byName)} (${roleTr}) bir mesaj ekledi.</p>`,
      ctaText: "Talebi görüntüle",
      ctaUrl: url,
    }),
    text: `Güncelleme: ${r.request_no} — ${byName} (${roleTr}) bir mesaj ekledi.\nGörüntüle: ${url}`,
  };
}

/** Neutral decision notice for subscribers (in_progress is never sent). */
export function subscriberDecision(
  r: RequestRow,
  baseUrl: string,
  target: "accepted" | "rejected" | "done" | "cancelled",
  reason?: string,
): Mail {
  const url = detailUrl(baseUrl, r.id, "subscriber");
  const label = DECISION_LABEL_TR[target];
  const rb = reasonBlock(reason);
  return {
    subject: `Takip ettiğiniz talep ${label}: ${r.request_no}`,
    html: emailLayout({
      heading: `Takip ettiğiniz talep ${label}`,
      bodyHtml: `<p style="margin:0 0 16px;"><strong>${esc(r.request_no)}</strong> — ${esc(r.title)} talebi ${label}.</p>` + rb.html,
      ctaText: "Talebi görüntüle",
      ctaUrl: url,
    }),
    text: `Takip ettiğiniz talep ${label}: ${r.request_no}${rb.text}\nGörüntüle: ${url}`,
  };
}

/** Welcome notice to a freshly-added subscriber. */
export function subscriberWelcome(
  r: RequestRow,
  baseUrl: string,
  addedByName: string,
): Mail {
  const url = detailUrl(baseUrl, r.id, "subscriber");
  return {
    subject: `Takipçi olarak eklendiniz: ${r.request_no}`,
    html: emailLayout({
      heading: "Bir talebe takipçi olarak eklendiniz",
      bodyHtml: `<p style="margin:0 0 16px;">${esc(addedByName)} sizi <strong>${esc(r.request_no)}</strong> — ${esc(r.title)} talebine takipçi olarak ekledi. Bu talepte olan bitenden e-posta ile haberdar olacaksınız.</p>`,
      ctaText: "Talebi görüntüle",
      ctaUrl: url,
    }),
    text: `${addedByName} sizi ${r.request_no} — ${r.title} talebine takipçi olarak ekledi.\nGörüntüle: ${url}`,
  };
}
