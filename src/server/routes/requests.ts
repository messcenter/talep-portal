// src/server/routes/requests.ts — JSON API: /api/my, /api/requests, /api/requests/:id, /api/requests/:id/reply
import type { User } from "../../domain/authz";
import { canViewRequest, canReply, canManageSubscribers, canRemoveSubscriber } from "../../domain/authz";
import { isHostedDomain } from "../../domain/hosted-domain";
import { newRequestSchema, replySchema } from "../../domain/validation";
import { collectFiles, processUploads, discardUploads } from "../uploads";
import { json } from "../handler";
import type { Deps } from "../handler";
import { newRequestAdmin, newRequestRequester, replyAdmin, subscriberWelcome, subscriberMessage } from "../../mail/templates";
import { collectRecipients } from "../../mail/recipients";

/** Parse a Bun Request's multipart body into a plain Record, normalizing
 * multiple values for the same key into an array (used for `files`). */
export async function parseForm(req: Request): Promise<Record<string, any>> {
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
      const errors = parsed.error.issues.map((i) => i.message);
      return json({ errors }, 400, extraHeaders);
    }
    // Strictness: department must be a managed one; module (if given) must belong to it.
    const dept = deps.repo.getDepartmentByName(parsed.data.department);
    if (!dept) {
      return json({ errors: ["Geçersiz departman"] }, 400, extraHeaders);
    }
    if (parsed.data.module_area && !deps.repo.listModuleNames(dept.id).includes(parsed.data.module_area)) {
      return json({ errors: ["Geçersiz modül"] }, 400, extraHeaders);
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
    const adminMail = newRequestAdmin(r, deps.config.appBaseUrl);
    for (const admin of deps.config.adminEmails) {
      deps.mailer.send(admin, adminMail.subject, adminMail.html, adminMail.text).catch(() => {});
    }
    const reqMail = newRequestRequester(r, deps.config.appBaseUrl);
    deps.mailer.send(user.email, reqMail.subject, reqMail.html, reqMail.text).catch(() => {});
    return json({ id: r.id }, 201, extraHeaders);
  }

  // GET /api/requests/:id
  const detailMatch = path.match(/^\/api\/requests\/(\d+)$/);
  if (detailMatch && method === "GET") {
    const id = Number(detailMatch[1]);
    if (!Number.isInteger(id)) return json({ error: "not found" }, 404, extraHeaders);
    const r = deps.repo.getRequest(id);
    if (!r) return json({ error: "not found" }, 404, extraHeaders);
    const isSub = deps.repo.isSubscriber(r.id, user.email);
    if (!canViewRequest(user, r, isSub))
      return json({ error: "not found" }, 404, extraHeaders);
    return json(
      {
        request: r,
        messages: deps.repo.listMessages(r.id),
        attachments: deps.repo.listAttachmentsByRequest(r.id),
        subscribers: deps.repo.listSubscribers(r.id),
        isSubscriber: isSub,
      },
      200,
      extraHeaders,
    );
  }

  // POST /api/requests/:id/subscribers — add a subscriber (CC)
  const subMatch = path.match(/^\/api\/requests\/(\d+)\/subscribers$/);
  if (subMatch && method === "POST") {
    const id = Number(subMatch[1]);
    if (!Number.isInteger(id)) return json({ error: "not found" }, 404, extraHeaders);
    const r = deps.repo.getRequest(id);
    if (!r) return json({ error: "not found" }, 404, extraHeaders);
    if (!canManageSubscribers(user, r)) return json({ error: "Yetkisiz" }, 403, extraHeaders);
    const form = await parseForm(req);
    const email = String(form.email ?? "").trim();
    if (!email) return json({ errors: ["E-posta gerekli"] }, 400, extraHeaders);
    if (!isHostedDomain(email, deps.config.googleHostedDomain))
      return json({ errors: ["Yalnızca kurumsal hesaplar eklenebilir"] }, 400, extraHeaders);
    if (email.toLowerCase() === r.requester_email.toLowerCase())
      return json({ errors: ["Talep sahibi zaten bildirim alıyor"] }, 400, extraHeaders);
    const added = deps.repo.addSubscriber(r.id, email, user.email, deps.now());
    if (added) {
      const mail = subscriberWelcome(r, deps.config.appBaseUrl, user.name);
      deps.mailer.send(added.email, mail.subject, mail.html, mail.text).catch(() => {});
      return json({ ok: true }, 201, extraHeaders);
    }
    return json({ ok: true }, 200, extraHeaders); // idempotent
  }

  // DELETE /api/requests/:id/subscribers — self-unsubscribe or manager removal
  if (subMatch && method === "DELETE") {
    const id = Number(subMatch[1]);
    if (!Number.isInteger(id)) return json({ error: "not found" }, 404, extraHeaders);
    const r = deps.repo.getRequest(id);
    if (!r) return json({ error: "not found" }, 404, extraHeaders);
    const form = await parseForm(req);
    const email = String(form.email ?? "").trim();
    if (!email) return json({ errors: ["E-posta gerekli"] }, 400, extraHeaders);
    if (!canRemoveSubscriber(user, r, email)) return json({ error: "Yetkisiz" }, 403, extraHeaders);
    const removed = deps.repo.removeSubscriber(r.id, email);
    if (!removed) return json({ error: "not found" }, 404, extraHeaders);
    return new Response(null, { status: 204, headers: new Headers({ ...extraHeaders }) });
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
      const errors = parsed.error.issues.map((i) => i.message);
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
    const replyMail = replyAdmin(r, deps.config.appBaseUrl);
    for (const admin of deps.config.adminEmails) {
      deps.mailer.send(admin, replyMail.subject, replyMail.html, replyMail.text).catch(() => {});
    }
    // Subscribers get a neutral "message added" notice (requester is the actor → excluded).
    const recipients = collectRecipients({
      requesterEmail: r.requester_email,
      subscribers: deps.repo.listSubscribers(r.id).map((s) => s.email),
      includeSubscribers: true,
      excludeEmail: user.email,
    });
    const subMail = subscriberMessage(r, deps.config.appBaseUrl, user.name, "requester");
    for (const rcpt of recipients) {
      deps.mailer.send(rcpt, subMail.subject, subMail.html, subMail.text).catch(() => {});
    }
    // 204 No Content — carry extraHeaders (e.g. csrf Set-Cookie).
    const resHeaders = new Headers({ ...extraHeaders });
    return new Response(null, { status: 204, headers: resHeaders });
  }

  // No match.
  return null;
}
