// src/routes/public.ts
import type { Hono } from "hono";
import type { AppEnv, Deps } from "../app";
import { body } from "../app";
import { newRequestSchema, replySchema } from "../domain/validation";
import { canViewRequest, canReply } from "../domain/authz";
import { newRequestForm, myList, requestDetail, esc } from "../views/views";

export function registerPublicRoutes(app: Hono<AppEnv>, deps: Deps) {
  app.get("/", (c) => c.html(newRequestForm(c.get("user"))));

  app.post("/requests", async (c) => {
    const user = c.get("user");
    const form = await body(c);
    const parsed = newRequestSchema.safeParse(form);
    if (!parsed.success) {
      const errs = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return c.html(newRequestForm(user, errs), 400);
    }
    const r = deps.repo.createRequest(
      { ...parsed.data, requester_name: user.name, requester_email: user.email },
      deps.now(),
    );
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

  app.post("/requests/:id/reply", async (c) => {
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.text("Bulunamadı", 404);
    const r = deps.repo.getRequest(id);
    if (!r || !canViewRequest(user, r)) return c.text("Bulunamadı", 404);
    if (!canReply(user, r)) return c.text("Şu an cevap veremezsiniz", 403);
    const parsed = replySchema.safeParse(await body(c));
    if (!parsed.success) return c.text("Geçersiz cevap", 400);
    deps.repo.addMessageAndTransition(
      r.id,
      { role: "requester", body: parsed.data.body },
      "answered",
      deps.now(),
    );
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
