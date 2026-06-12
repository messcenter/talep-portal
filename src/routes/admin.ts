// src/routes/admin.ts
import type { Hono } from "hono";
import type { AppEnv, Deps } from "../app";
import { body } from "../app";
import { messageSchema, decisionSchema } from "../domain/validation";
import { canTransition } from "../domain/status";
import { adminList, requestDetail, esc } from "../views/views";
import { collectFiles, processUploads, discardUploads } from "./uploads";

function requireAdmin(c: any): boolean {
  return c.get("user")?.isAdmin === true;
}

export function registerAdminRoutes(app: Hono<AppEnv>, deps: Deps) {
  app.get("/admin", (c) => {
    if (!requireAdmin(c)) return c.text("Yetkisiz", 403);
    const status = c.req.query("status");
    return c.html(
      adminList(c.get("user"), deps.repo.listAll({ status }), { status }),
    );
  });

  app.post("/admin/requests/:id/message", async (c) => {
    if (!requireAdmin(c)) return c.text("Yetkisiz", 403);
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.text("Bulunamadı", 404);
    const r = deps.repo.getRequest(id);
    if (!r) return c.text("Bulunamadı", 404);
    const form = await body(c);
    const parsed = messageSchema.safeParse(form);
    if (!parsed.success) return c.text("Geçersiz soru", 400);
    if (!canTransition(r.status, "clarifying"))
      return c.text("Bu talep kapalı", 409);
    const up = await processUploads(collectFiles(form), deps.storage);
    if (!up.ok) return c.text(up.errors.join(" "), 400);
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
    await deps.mailer.send(
      r.requester_email,
      `Talebiniz hakkında soru: ${r.request_no}`,
      `<p>Talebinizle ilgili sorular var. <a href="${deps.config.appBaseUrl}/requests/${r.id}">Cevaplayın</a></p>`,
    );
    return c.redirect(`/admin/requests/${r.id}`);
  });

  app.post("/admin/requests/:id/decision", async (c) => {
    if (!requireAdmin(c)) return c.text("Yetkisiz", 403);
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.text("Bulunamadı", 404);
    const r = deps.repo.getRequest(id);
    if (!r) return c.text("Bulunamadı", 404);
    const parsed = decisionSchema.safeParse(await body(c));
    if (!parsed.success) return c.text("Karar için gerekçe gerekli", 400);
    const target = parsed.data.decision === "accept" ? "accepted" : "rejected";
    if (!canTransition(r.status, target))
      return c.text("Bu talep zaten kapalı", 409);
    deps.repo.addMessageAndTransition(
      r.id,
      parsed.data.reason ? { role: "admin", body: parsed.data.reason } : null,
      target,
      deps.now(),
    );
    await deps.mailer.send(
      r.requester_email,
      `Talep ${target === "accepted" ? "kabul edildi" : "reddedildi"}: ${r.request_no}`,
      `<p>${r.request_no} ${target === "accepted" ? "kabul edildi" : "reddedildi"}.</p>${parsed.data.reason ? `<p>${esc(parsed.data.reason)}</p>` : ""}`,
    );
    return c.redirect(`/admin/requests/${r.id}`);
  });

  app.get("/admin/requests/:id", (c) => {
    if (!requireAdmin(c)) return c.text("Yetkisiz", 403);
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.text("Bulunamadı", 404);
    const r = deps.repo.getRequest(id);
    if (!r) return c.text("Bulunamadı", 404);
    return c.html(
      requestDetail({
        user: c.get("user"),
        r,
        messages: deps.repo.listMessages(r.id),
        canReply: false,
        isAdmin: true,
        csrf: c.get("csrf"),
      }),
    );
  });
}
