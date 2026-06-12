// src/server/routes/requests.ts — JSON API: /api/my, /api/requests, /api/requests/:id, /api/requests/:id/reply
import type { User } from "../../domain/authz";
import { canViewRequest, canReply } from "../../domain/authz";
import { newRequestSchema, replySchema } from "../../domain/validation";
import { collectFiles, processUploads, discardUploads } from "../uploads";
import { json } from "../handler";
import type { Deps } from "../handler";
import { esc } from "../../views/views";

/** Parse a Bun Request's multipart body into a plain Record, normalizing
 * multiple values for the same key into an array (used for `files`). */
async function parseForm(req: Request): Promise<Record<string, any>> {
  const fd = await req.formData();
  const out: Record<string, any> = {};
  for (const [k, v] of fd.entries()) {
    if (k in out) {
      out[k] = Array.isArray(out[k]) ? [...out[k], v] : [out[k], v];
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Dispatcher for all /api/requests* and /api/my routes.
 * Returns a Response if the path matched, or null to fall through to 404.
 */
export async function handleRequests(
  path: string,
  method: string,
  req: Request,
  user: User,
  extraHeaders: Record<string, string>,
  deps: Deps,
): Promise<Response | null> {
  // GET /api/my
  if (path === "/api/my" && method === "GET") {
    const rows = deps.repo.listByEmail(user.email);
    return json(rows, 200, extraHeaders);
  }

  // POST /api/requests
  if (path === "/api/requests" && method === "POST") {
    const form = await parseForm(req);
    const parsed = newRequestSchema.safeParse(form);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return json({ errors }, 400, extraHeaders);
    }
    const up = await processUploads(collectFiles(form), deps.storage);
    if (!up.ok) return json({ errors: up.errors }, 400, extraHeaders);
    let r;
    try {
      r = deps.repo.createRequest(
        { ...parsed.data, requester_name: user.name, requester_email: user.email },
        deps.now(),
        up.attachments,
      );
    } catch (err) {
      await discardUploads(deps.storage, up.attachments);
      throw err;
    }
    // Best-effort mails — failures must not block the response.
    for (const admin of deps.config.adminEmails) {
      deps.mailer.send(
        admin,
        `Yeni talep: ${r.request_no}`,
        `<p>${r.request_no} — ${esc(r.title)}</p><p><a href="${deps.config.appBaseUrl}/admin/requests/${r.id}">İncele</a></p>`,
      ).catch(() => {});
    }
    deps.mailer.send(
      user.email,
      `Talebiniz alındı: ${r.request_no}`,
      `<p>Talebiniz alındı. Takip: <a href="${deps.config.appBaseUrl}/requests/${r.id}">${r.request_no}</a></p>`,
    ).catch(() => {});
    return json({ id: r.id }, 201, extraHeaders);
  }

  // GET /api/requests/:id
  const detailMatch = path.match(/^\/api\/requests\/(\d+)$/);
  if (detailMatch && method === "GET") {
    const id = Number(detailMatch[1]);
    if (!Number.isInteger(id)) return json({ error: "not found" }, 404, extraHeaders);
    const r = deps.repo.getRequest(id);
    if (!r || !canViewRequest(user, r)) return json({ error: "not found" }, 404, extraHeaders);
    return json(
      {
        request: r,
        messages: deps.repo.listMessages(r.id),
        attachments: deps.repo.listAttachmentsByRequest(r.id),
      },
      200,
      extraHeaders,
    );
  }

  // POST /api/requests/:id/reply
  const replyMatch = path.match(/^\/api\/requests\/(\d+)\/reply$/);
  if (replyMatch && method === "POST") {
    const id = Number(replyMatch[1]);
    if (!Number.isInteger(id)) return json({ error: "not found" }, 404, extraHeaders);
    const r = deps.repo.getRequest(id);
    if (!r || !canViewRequest(user, r)) return json({ error: "not found" }, 404, extraHeaders);
    if (!canReply(user, r)) return json({ error: "forbidden" }, 403, extraHeaders);
    const form = await parseForm(req);
    const parsed = replySchema.safeParse(form);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return json({ errors }, 400, extraHeaders);
    }
    const up = await processUploads(collectFiles(form), deps.storage);
    if (!up.ok) return json({ errors: up.errors }, 400, extraHeaders);
    try {
      deps.repo.addMessageAndTransition(
        r.id,
        { role: "requester", body: parsed.data.body },
        "answered",
        deps.now(),
        up.attachments,
      );
    } catch (err) {
      await discardUploads(deps.storage, up.attachments);
      throw err;
    }
    // Best-effort mails.
    for (const admin of deps.config.adminEmails) {
      deps.mailer.send(
        admin,
        `Cevaplandı: ${r.request_no}`,
        `<p><a href="${deps.config.appBaseUrl}/admin/requests/${r.id}">${r.request_no} cevaplandı</a></p>`,
      ).catch(() => {});
    }
    // 204 No Content — carry extraHeaders (e.g. csrf Set-Cookie).
    const resHeaders = new Headers({ ...extraHeaders });
    return new Response(null, { status: 204, headers: resHeaders });
  }

  // No match.
  return null;
}
