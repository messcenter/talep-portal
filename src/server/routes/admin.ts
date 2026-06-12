// src/server/routes/admin.ts — JSON API: /api/admin/requests, /api/admin/requests/:id/message|decision
import type { User } from "../../domain/authz";
import { messageSchema, decisionSchema } from "../../domain/validation";
import { canTransition } from "../../domain/status";
import { collectFiles, processUploads, discardUploads } from "../uploads";
import { json } from "../handler";
import type { Deps } from "../handler";
import { parseForm } from "./requests";
import { esc } from "../escape";

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

  // POST /api/admin/requests/:id/message
  const messageMatch = path.match(/^\/api\/admin\/requests\/(\d+)\/message$/);
  if (messageMatch && method === "POST") {
    if (!user.isAdmin) return json({ error: "Yetkisiz" }, 403, extraHeaders);
    const id = Number(messageMatch[1]);
    if (!Number.isInteger(id)) return json({ error: "not found" }, 404, extraHeaders);
    const r = deps.repo.getRequest(id);
    if (!r) return json({ error: "not found" }, 404, extraHeaders);
    const form = await parseForm(req);
    const parsed = messageSchema.safeParse(form);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
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
    deps.mailer.send(
      r.requester_email,
      `Talebiniz hakkında soru: ${r.request_no}`,
      `<p>Talebinizle ilgili sorular var. <a href="${deps.config.appBaseUrl}/requests/${r.id}">Cevaplayın</a></p>`,
    ).catch(() => {});
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
    const form = await parseForm(req);
    const parsed = decisionSchema.safeParse(form);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
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
    deps.mailer.send(
      r.requester_email,
      `Talep ${target === "accepted" ? "kabul edildi" : "reddedildi"}: ${r.request_no}`,
      `<p>${r.request_no} ${target === "accepted" ? "kabul edildi" : "reddedildi"}.</p>${parsed.data.reason ? `<p>${esc(parsed.data.reason)}</p>` : ""}`,
    ).catch(() => {});
    const resHeaders = new Headers({ ...extraHeaders });
    return new Response(null, { status: 204, headers: resHeaders });
  }

  // No match.
  return null;
}
