// src/views/views.ts
import type { RequestRow, MessageRow, AttachmentRow } from "../db/repo";
import { statusLabelTr, type RequestStatus } from "../domain/status";
import { REQUEST_TYPES, PRIORITIES } from "../domain/validation";

const TYPE_TR: Record<string, string> = {
  feature: "Yeni Özellik",
  bug: "Hata",
  task: "Görev",
};
const PRIO_TR: Record<string, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
};

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function layout(title: string, body: string, user?: { name: string }): string {
  return `<!doctype html><html lang="tr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Talep Portalı</title>
<script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-slate-50 text-slate-800">
<header class="bg-white border-b">
  <div class="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
    <a href="/" class="font-semibold">Talep Portalı</a>
    <nav class="text-sm flex gap-4 items-center">
      <a href="/my" class="hover:underline">Taleplerim</a>
      ${user ? `<span class="text-slate-500">${esc(user.name)}</span>
      <form method="post" action="/logout"><button class="hover:underline">Çıkış</button></form>` : ""}
    </nav>
  </div>
</header>
<main class="max-w-4xl mx-auto px-4 py-6">${body}</main>
</body></html>`;
}

export function loginPage(): string {
  return layout(
    "Giriş",
    `<div class="bg-white rounded-lg border p-8 text-center">
      <h1 class="text-xl font-semibold mb-2">Talep Portalı</h1>
      <p class="text-slate-500 mb-6">Devam etmek için kurumsal hesabınızla giriş yapın.</p>
      <a href="/auth/google" class="inline-block bg-slate-800 text-white px-5 py-2 rounded">Google ile giriş</a>
    </div>`,
  );
}

export function newRequestForm(
  user: { name: string },
  csrf: string,
  errors?: string[],
): string {
  const opt = (
    list: readonly string[],
    tr: Record<string, string>,
  ): string =>
    list.map((v) => `<option value="${v}">${esc(tr[v] ?? v)}</option>`).join("");
  const err = errors?.length
    ? `<div class="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4">
        <ul class="list-disc pl-5">${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`
    : "";
  const field = (label: string, html: string) =>
    `<label class="block mb-4"><span class="block text-sm font-medium mb-1">${esc(label)}</span>${html}</label>`;
  const input = `class="w-full border rounded px-3 py-2"`;
  return layout(
    "Yeni Talep",
    `<h1 class="text-xl font-semibold mb-4">Yeni Talep</h1>${err}
    <form method="post" action="/requests" enctype="multipart/form-data" class="bg-white rounded-lg border p-6">
      <input type="hidden" name="_csrf" value="${esc(csrf)}">
      ${field("Departman", `<input ${input} name="department" required>`)}
      ${field("Uygulama", `<input ${input} name="application" value="ERP" required>`)}
      ${field("Modül/Alan (opsiyonel)", `<input ${input} name="module_area">`)}
      ${field("Talep Tipi", `<select ${input} name="request_type">${opt(REQUEST_TYPES, TYPE_TR)}</select>`)}
      ${field("Öncelik", `<select ${input} name="priority">${opt(PRIORITIES, PRIO_TR)}</select>`)}
      ${field("Başlık", `<input ${input} name="title" required>`)}
      ${field("Açıklama", `<textarea ${input} name="description" rows="4" required></textarea>`)}
      ${field("Beklenen Fayda", `<textarea ${input} name="expected_benefit" rows="2" required></textarea>`)}
      ${field(
        "Ekler (resim/PDF, en çok 10 dosya, 10 MB)",
        `<input type="file" name="files" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" class="block w-full text-sm">`,
      )}
      <button class="bg-slate-800 text-white px-5 py-2 rounded">Gönder</button>
    </form>`,
    user,
  );
}

export function requestRow(r: RequestRow): string {
  return `<a href="/requests/${r.id}" class="block bg-white border rounded p-4 mb-2 hover:bg-slate-50">
    <div class="flex justify-between">
      <span class="font-medium">${esc(r.request_no)} · ${esc(r.title)}</span>
      <span class="text-sm text-slate-500">${esc(statusLabelTr(r.status))}</span>
    </div>
    <div class="text-sm text-slate-500">${esc(PRIO_TR[r.priority] ?? r.priority)} · ${esc(r.application)}</div>
  </a>`;
}

export function myList(user: { name: string }, rows: RequestRow[]): string {
  const body = rows.length
    ? rows.map(requestRow).join("")
    : `<p class="text-slate-500">Henüz talebiniz yok. <a class="underline" href="/">Yeni talep</a> oluşturun.</p>`;
  return layout(
    "Taleplerim",
    `<div class="flex justify-between items-center mb-4">
      <h1 class="text-xl font-semibold">Taleplerim</h1>
      <a href="/" class="bg-slate-800 text-white px-4 py-2 rounded text-sm">Yeni talep</a>
    </div>${body}`,
    user,
  );
}

export function attachmentChips(requestId: number, atts: AttachmentRow[]): string {
  if (!atts.length) return "";
  const items = atts
    .map((a) => {
      const url = `/requests/${requestId}/attachments/${a.id}`;
      if (a.mime.startsWith("image/")) {
        return `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${esc(a.original_name)}" class="h-24 w-24 object-cover border rounded"></a>`;
      }
      return `<a href="${url}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 border rounded px-3 py-2 text-sm bg-white hover:bg-slate-50">📄 ${esc(a.original_name)}</a>`;
    })
    .join("");
  return `<div class="flex flex-wrap gap-3 mt-2">${items}</div>`;
}

export function thread(
  messages: MessageRow[],
  attByMessage: Map<number, AttachmentRow[]>,
  requestId: number,
): string {
  if (!messages.length)
    return `<p class="text-slate-500 text-sm">Henüz mesaj yok.</p>`;
  return messages
    .map((m) => {
      const isAdmin = m.author_role === "admin";
      return `<div class="mb-3 ${isAdmin ? "" : "pl-8"}">
        <div class="text-xs text-slate-400 mb-1">${isAdmin ? "Yönetici (soru)" : "Talep eden (cevap)"} · ${esc(m.created_at)}</div>
        <div class="bg-white border rounded p-3 whitespace-pre-wrap">${esc(m.body)}</div>
        ${attachmentChips(requestId, attByMessage.get(m.id) ?? [])}
      </div>`;
    })
    .join("");
}

export function requestDetail(opts: {
  user: { name: string };
  r: RequestRow;
  messages: MessageRow[];
  attachments: AttachmentRow[];
  canReply: boolean;
  isAdmin: boolean;
  csrf: string;
}): string {
  const { r, messages, attachments, canReply, isAdmin, csrf, user } = opts;
  const meta = `<div class="bg-white border rounded p-4 mb-4">
    <h1 class="text-xl font-semibold">${esc(r.request_no)} · ${esc(r.title)}</h1>
    <div class="text-sm text-slate-500 mb-2">${esc(statusLabelTr(r.status))} · ${esc(PRIO_TR[r.priority] ?? r.priority)} · ${esc(r.department)}</div>
    <p class="whitespace-pre-wrap mb-2">${esc(r.description)}</p>
    <p class="text-sm"><span class="font-medium">Beklenen fayda:</span> ${esc(r.expected_benefit)}</p>
  </div>`;
  const requestLevel = attachments.filter((a) => a.message_id == null);
  const byMessage = new Map<number, AttachmentRow[]>();
  for (const a of attachments) {
    if (a.message_id == null) continue;
    const list = byMessage.get(a.message_id) ?? [];
    list.push(a);
    byMessage.set(a.message_id, list);
  }
  const metaWithFiles = meta + attachmentChips(r.id, requestLevel);
  const input = `class="w-full border rounded px-3 py-2"`;
  const replyBox = canReply
    ? `<form method="post" action="/requests/${r.id}/reply" enctype="multipart/form-data" class="bg-white border rounded p-4 mt-4">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <textarea ${input} name="body" rows="3" placeholder="Cevabınız..." required></textarea>
        <input type="file" name="files" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" class="block w-full text-sm mt-2">
        <button class="bg-slate-800 text-white px-4 py-2 rounded mt-2">Cevapla</button>
      </form>`
    : "";
  const adminBox = isAdmin
    ? `<form method="post" action="/admin/requests/${r.id}/message" enctype="multipart/form-data" class="bg-white border rounded p-4 mt-4">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <textarea ${input} name="body" rows="3" placeholder="Netleştirme sorusu..." required></textarea>
        <input type="file" name="files" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" class="block w-full text-sm mt-2">
        <button class="bg-slate-800 text-white px-4 py-2 rounded mt-2">Soru ekle</button>
      </form>
      <form method="post" action="/admin/requests/${r.id}/decision" class="bg-white border rounded p-4 mt-4">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <textarea ${input} name="reason" rows="2" placeholder="Karar notu / ret gerekçesi"></textarea>
        <div class="flex gap-2 mt-2">
          <button name="decision" value="accept" class="bg-green-700 text-white px-4 py-2 rounded">Kabul et</button>
          <button name="decision" value="reject" class="bg-red-700 text-white px-4 py-2 rounded">Reddet</button>
        </div>
      </form>`
    : "";
  return layout(
    r.request_no,
    `${metaWithFiles}<h2 class="font-semibold mb-2">Netleştirme</h2>${thread(messages, byMessage, r.id)}${replyBox}${adminBox}`,
    user,
  );
}

export function adminList(
  user: { name: string },
  rows: RequestRow[],
  filter: { status?: string },
): string {
  const statuses: RequestStatus[] = [
    "new",
    "clarifying",
    "answered",
    "accepted",
    "rejected",
  ];
  const tabs = [`<a href="/admin" class="px-3 py-1 rounded ${!filter.status ? "bg-slate-800 text-white" : "bg-white border"}">Hepsi</a>`]
    .concat(
      statuses.map(
        (s) =>
          `<a href="/admin?status=${s}" class="px-3 py-1 rounded ${filter.status === s ? "bg-slate-800 text-white" : "bg-white border"}">${esc(statusLabelTr(s))}</a>`,
      ),
    )
    .join(" ");
  const body = rows.length
    ? rows.map(requestRow).join("")
    : `<p class="text-slate-500">Kayıt yok.</p>`;
  return layout(
    "Yönetim",
    `<h1 class="text-xl font-semibold mb-4">Tüm Talepler</h1>
     <div class="flex flex-wrap gap-2 mb-4 text-sm">${tabs}</div>${body}`,
    user,
  );
}

export function noticePage(
  user: { name: string },
  title: string,
  message: string,
): string {
  return layout(
    title,
    `<div class="bg-white border rounded p-6">
      <h1 class="text-xl font-semibold mb-2">${esc(title)}</h1>
      <p>${esc(message)}</p>
      <a href="/my" class="underline text-sm">Taleplerime git</a>
    </div>`,
    user,
  );
}
