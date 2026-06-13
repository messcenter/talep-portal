// src/server/routes/admin.ts — JSON API: /api/admin/requests, /api/admin/requests/:id/message|decision
import type { User } from "../../domain/authz";
import { messageSchema, decisionSchema } from "../../domain/validation";
import { canTransition } from "../../domain/status";
import { collectFiles, processUploads, discardUploads } from "../uploads";
import { json } from "../handler";
import type { Deps } from "../handler";
import { parseForm } from "./requests";
import { questionRequester, decisionRequester } from "../../mail/templates";
import { requestToMarkdown } from "../../domain/export";
import { buildDashboardStats } from "../../domain/stats";

/**
 * Dispatcher for all /api/admin/* routes.
 * Returns a Response if the path matched, or null to fall through to 404.
 * Admin-only: every route returns 403 if user.isAdmin is false.
 */
export async function handleAdmin(
  path: string,
  method: string,
  req: Request,
  user: User,
  extraHeaders: Record<string, string>,
  deps: Deps,
): Promise<Response | null> {
  // GET /api/admin/requests?status=
  if (path === "/api/admin/requests" && method === "GET") {
    if (!user.isAdmin) return json({ error: "Yetkisiz" }, 403, extraHeaders);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? undefined;
    const rows = deps.repo.listAll({ status });
    return json(rows, 200, extraHeaders);
  }

  // GET /api/admin/stats
  if (path === "/api/admin/stats" && method === "GET") {
    if (!user.isAdmin) return json({ error: "Yetkisiz" }, 403, extraHeaders);
    const stats = buildDashboardStats(deps.repo.listForStats(), deps.now());
    return json(stats, 200, extraHeaders);
  }

  // GET /api/admin/requests/:id/export.md
  const exportMatch = path.match(/^\/api\/admin\/requests\/(\d+)\/export\.md$/);
  if (exportMatch && method === "GET") {
    if (!user.isAdmin) return json({ error: "Yetkisiz" }, 403, extraHeaders);
    const id = Number(exportMatch[1]);
    if (!Number.isInteger(id)) return json({ error: "not found" }, 404, extraHeaders);
    const r = deps.repo.getRequest(id);
    if (!r) return json({ error: "not found" }, 404, extraHeaders);
    const md = requestToMarkdown({
      request: r,
      messages: deps.repo.listMessages(r.id),
      attachments: deps.repo.listAttachmentsByRequest(r.id),
    });
    const safeNo = r.request_no.replace(/[^\w-]/g, "_");
    const headers = new Headers({
      ...extraHeaders,
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeNo}.md"`,
    });
    return new Response(md, { status: 200, headers });
  }

  // POST /api/admin/requests/:id/message
  const messageMatch = path.match(/^\/api\/admin\/requests\/(\d+)\/message$/);
  if (messageMatch && method === "POST") {
    if (!user.isAdmin) return json({ error: "Yetkisiz" }, 403, extraHeaders);
    const id = Number(messageMatch[1]);
    if (!Number.isInteger(id)) return json({ error: "not found" }, 404, extraHeaders);
    const r = deps.repo.getRequest(id);
    if (!r) return json({ error: "not found" }, 404, extraHeaders);
    // Separation of duties: an admin may not clarify/decide their OWN request.
    if (r.requester_email.toLowerCase() === user.email.toLowerCase()) {
      return json({ error: "Kendi talebinizde yönetici işlemi yapamazsınız" }, 403, extraHeaders);
    }
    const form = await parseForm(req);
    const parsed = messageSchema.safeParse(form);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => i.message);
      return json({ errors }, 400, extraHeaders);
    }
    if (!canTransition(r.status, "clarifying")) {
      return json({ error: "Bu talep kapalı" }, 409, extraHeaders);
    }
    const up = await processUploads(collectFiles(form), deps.storage);
    if (!up.ok) return json({ errors: up.errors }, 400, extraHeaders);
    try {
      deps.repo.addMessageAndTransition(
        r.id,
        { role: "admin", body: parsed.data.body },
        "clarifying",
        deps.now(),
        up.attachments,
      );
    } catch (err) {
      await discardUploads(deps.storage, up.attachments);
      throw err;
    }
    // Best-effort mail to requester.
    const qMail = questionRequester(r, deps.config.appBaseUrl);
    deps.mailer.send(r.requester_email, qMail.subject, qMail.html, qMail.text).catch(() => {});
    const resHeaders = new Headers({ ...extraHeaders });
    return new Response(null, { status: 204, headers: resHeaders });
  }

  // POST /api/admin/requests/:id/decision
  const decisionMatch = path.match(/^\/api\/admin\/requests\/(\d+)\/decision$/);
  if (decisionMatch && method === "POST") {
    if (!user.isAdmin) return json({ error: "Yetkisiz" }, 403, extraHeaders);
    const id = Number(decisionMatch[1]);
    if (!Number.isInteger(id)) return json({ error: "not found" }, 404, extraHeaders);
    const r = deps.repo.getRequest(id);
    if (!r) return json({ error: "not found" }, 404, extraHeaders);
    // Separation of duties: an admin may not clarify/decide their OWN request.
    if (r.requester_email.toLowerCase() === user.email.toLowerCase()) {
      return json({ error: "Kendi talebinizde yönetici işlemi yapamazsınız" }, 403, extraHeaders);
    }
    const form = await parseForm(req);
    const parsed = decisionSchema.safeParse(form);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => i.message);
      return json({ errors }, 400, extraHeaders);
    }
    const target = parsed.data.decision === "accept" ? "accepted" : "rejected";
    if (!canTransition(r.status, target)) {
      return json({ error: "Bu talep zaten kapalı" }, 409, extraHeaders);
    }
    deps.repo.addMessageAndTransition(
      r.id,
      parsed.data.reason ? { role: "admin", body: parsed.data.reason } : null,
      target,
      deps.now(),
    );
    // Best-effort mail to requester.
    const dMail = decisionRequester(r, deps.config.appBaseUrl, target, parsed.data.reason);
    deps.mailer.send(r.requester_email, dMail.subject, dMail.html, dMail.text).catch(() => {});
    const resHeaders = new Headers({ ...extraHeaders });
    return new Response(null, { status: 204, headers: resHeaders });
  }

  // No match.
  return null;
}
