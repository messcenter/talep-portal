// src/routes/public.ts
import type { Hono } from "hono";
import type { AppEnv, Deps } from "../app";
import { body } from "../app";
import { newRequestSchema, replySchema } from "../domain/validation";
import { canViewRequest, canReply } from "../domain/authz";
import { newRequestForm, myList, requestDetail, esc } from "../views/views";
import { collectFiles, processUploads, discardUploads } from "./uploads";

export function registerPublicRoutes(app: Hono<AppEnv>, deps: Deps) {
  app.get("/", (c) => c.html(newRequestForm(c.get("user"), c.get("csrf"))));

  app.post("/requests", async (c) => {
    const user = c.get("user");
    const form = await body(c);
    const parsed = newRequestSchema.safeParse(form);
    if (!parsed.success) {
      const errs = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return c.html(newRequestForm(user, c.get("csrf"), errs), 400);
    }
    const up = await processUploads(collectFiles(form), deps.storage);
    if (!up.ok) return c.html(newRequestForm(user, c.get("csrf"), up.errors), 400);
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
    for (const admin of deps.config.adminEmails) {
      await deps.mailer.send(
        admin,
        `Yeni talep: ${r.request_no}`,
        `<p>${r.request_no} — ${esc(r.title)}</p><p><a href="${deps.config.appBaseUrl}/admin/requests/${r.id}">İncele</a></p>`,
      );
    }
    await deps.mailer.send(
      user.email,
      `Talebiniz alındı: ${r.request_no}`,
      `<p>Talebiniz alındı. Takip: <a href="${deps.config.appBaseUrl}/requests/${r.id}">${r.request_no}</a></p>`,
    );
    return c.redirect(`/requests/${r.id}`);
  });

  app.get("/my", (c) => {
    const user = c.get("user");
    return c.html(myList(user, deps.repo.listByEmail(user.email)));
  });

  app.get("/requests/:id", (c) => {
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.text("Bulunamadı", 404);
    const r = deps.repo.getRequest(id);
    if (!r || !canViewRequest(user, r)) return c.text("Bulunamadı", 404);
    return c.html(
      requestDetail({
        user,
        r,
        messages: deps.repo.listMessages(r.id),
        canReply: canReply(user, r),
        isAdmin: user.isAdmin,
        csrf: c.get("csrf"),
      }),
    );
  });

  app.get("/requests/:id/attachments/:attId", async (c) => {
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    const attId = Number(c.req.param("attId"));
    if (!Number.isInteger(id) || !Number.isInteger(attId))
      return c.text("Bulunamadı", 404);
    const att = deps.repo.getAttachment(attId);
    if (!att || att.request_id !== id) return c.text("Bulunamadı", 404);
    const r = deps.repo.getRequest(att.request_id);
    if (!r || !canViewRequest(user, r)) return c.text("Bulunamadı", 404);
    const bytes = await deps.storage.read(att.storage_key);
    if (!bytes) return c.text("Bulunamadı", 404);
    const safeName = att.original_name.replace(/[\r\n"\\]/g, "_");
    // Defense in depth: only serve the sniff-allowed types inline with their real
    // content-type; force anything else to a non-rendering download. The CSP sandbox
    // neutralizes active content (e.g. JS in a PDF) even for allowlisted types.
    const SAFE_INLINE = new Set([
      "image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf",
    ]);
    const inlineOk = SAFE_INLINE.has(att.mime);
    c.header("Content-Type", inlineOk ? att.mime : "application/octet-stream");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Content-Security-Policy", "sandbox; default-src 'none'");
    c.header("Content-Disposition", `${inlineOk ? "inline" : "attachment"}; filename="${safeName}"`);
    c.header("Cache-Control", "private, max-age=300");
    return c.body(bytes);
  });

  app.post("/requests/:id/reply", async (c) => {
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.text("Bulunamadı", 404);
    const r = deps.repo.getRequest(id);
    if (!r || !canViewRequest(user, r)) return c.text("Bulunamadı", 404);
    if (!canReply(user, r)) return c.text("Şu an cevap veremezsiniz", 403);
    const form = await body(c);
    const parsed = replySchema.safeParse(form);
    if (!parsed.success) return c.text("Geçersiz cevap", 400);
    const up = await processUploads(collectFiles(form), deps.storage);
    if (!up.ok) return c.text(up.errors.join(" "), 400);
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
    for (const admin of deps.config.adminEmails) {
      await deps.mailer.send(
        admin,
        `Cevaplandı: ${r.request_no}`,
        `<p><a href="${deps.config.appBaseUrl}/admin/requests/${r.id}">${r.request_no} cevaplandı</a></p>`,
      );
    }
    return c.redirect(`/requests/${r.id}`);
  });
}
