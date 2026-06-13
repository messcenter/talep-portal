// src/server/routes/definitions.ts — GET /api/departments + /api/applications + admin CRUD for departments/modules/applications.
import type { User } from "../../domain/authz";
import { json } from "../handler";
import type { Deps } from "../handler";

function isUniqueErr(e: unknown): boolean {
  return e instanceof Error && /UNIQUE/i.test(e.message);
}

async function readName(req: Request): Promise<string | null> {
  try {
    const ct = req.headers.get("content-type") ?? "";
    let name: unknown;
    if (ct.includes("application/json")) name = (await req.json())?.name;
    else name = (await req.formData()).get("name");
    if (typeof name !== "string") return null;
    const trimmed = name.trim();
    return trimmed.length ? trimmed : null;
  } catch {
    return null;
  }
}

export async function handleDefinitions(
  path: string,
  method: string,
  req: Request,
  user: User,
  extraHeaders: Record<string, string>,
  deps: Deps,
): Promise<Response | null> {
  // GET /api/departments — available to any authenticated user (needed to populate forms)
  if (path === "/api/departments" && method === "GET") {
    return json(deps.repo.listDepartmentsWithModules(), 200, extraHeaders);
  }

  // GET /api/applications — available to any authenticated user (needed to populate forms)
  if (path === "/api/applications" && method === "GET") {
    return json(deps.repo.listApplications(), 200, extraHeaders);
  }

  if (
    path.startsWith("/api/admin/departments") ||
    path.startsWith("/api/admin/modules") ||
    path.startsWith("/api/admin/applications")
  ) {
    if (!user.isAdmin) return json({ error: "forbidden" }, 403, extraHeaders);

    // POST /api/admin/departments
    if (path === "/api/admin/departments" && method === "POST") {
      const name = await readName(req);
      if (!name) return json({ errors: ["İsim gerekli"] }, 400, extraHeaders);
      try {
        const d = deps.repo.createDepartment(name, deps.now());
        return json({ id: d.id }, 201, extraHeaders);
      } catch (e) {
        if (isUniqueErr(e)) return json({ error: "Bu departman zaten var" }, 409, extraHeaders);
        throw e;
      }
    }

    // DELETE /api/admin/departments/:id
    let m = path.match(/^\/api\/admin\/departments\/(\d+)$/);
    if (m && method === "DELETE") {
      const id = Number(m[1]);
      if (!deps.repo.getDepartment(id)) return json({ error: "not found" }, 404, extraHeaders);
      deps.repo.deleteDepartment(id);
      return new Response(null, { status: 204, headers: extraHeaders });
    }

    // POST /api/admin/departments/:id/modules
    m = path.match(/^\/api\/admin\/departments\/(\d+)\/modules$/);
    if (m && method === "POST") {
      const deptId = Number(m[1]);
      if (!deps.repo.getDepartment(deptId)) return json({ error: "not found" }, 404, extraHeaders);
      const name = await readName(req);
      if (!name) return json({ errors: ["İsim gerekli"] }, 400, extraHeaders);
      try {
        const mod = deps.repo.createModule(deptId, name, deps.now());
        return json({ id: mod.id }, 201, extraHeaders);
      } catch (e) {
        if (isUniqueErr(e)) return json({ error: "Bu modül zaten var" }, 409, extraHeaders);
        throw e;
      }
    }

    // DELETE /api/admin/modules/:id
    m = path.match(/^\/api\/admin\/modules\/(\d+)$/);
    if (m && method === "DELETE") {
      const id = Number(m[1]);
      if (!deps.repo.getModule(id)) return json({ error: "not found" }, 404, extraHeaders);
      deps.repo.deleteModule(id);
      return new Response(null, { status: 204, headers: extraHeaders });
    }

    // POST /api/admin/applications
    if (path === "/api/admin/applications" && method === "POST") {
      const name = await readName(req);
      if (!name) return json({ errors: ["İsim gerekli"] }, 400, extraHeaders);
      try {
        const a = deps.repo.createApplication(name, deps.now());
        return json({ id: a.id }, 201, extraHeaders);
      } catch (e) {
        if (isUniqueErr(e)) return json({ error: "Bu uygulama zaten var" }, 409, extraHeaders);
        throw e;
      }
    }

    // DELETE /api/admin/applications/:id
    m = path.match(/^\/api\/admin\/applications\/(\d+)$/);
    if (m && method === "DELETE") {
      const id = Number(m[1]);
      if (!deps.repo.getApplication(id)) return json({ error: "not found" }, 404, extraHeaders);
      deps.repo.deleteApplication(id);
      return new Response(null, { status: 204, headers: extraHeaders });
    }
  }

  return null;
}
