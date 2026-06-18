// src/db/repo.ts
import type { Database } from "bun:sqlite";
import { formatRequestNo } from "../domain/request-no";
import { canTransition, type RequestStatus } from "../domain/status";
import type { NewRequestInput } from "../domain/validation";
import type { StatsRow } from "../domain/stats";

export type RequestRow = {
  id: number;
  request_no: string;
  created_at: string;
  requester_name: string;
  requester_email: string;
  department: string;
  application: string;
  module_area: string;
  request_type: string;
  title: string;
  description: string;
  expected_benefit: string;
  priority: string;
  status: RequestStatus;
  /** Latest message timestamp, else created_at. Populated only by listByEmail. */
  last_activity_at?: string;
};

export type MessageRow = {
  id: number;
  request_id: number;
  author_role: "admin" | "requester";
  body: string;
  created_at: string;
};

export type AttachmentInput = {
  storage_key: string;
  original_name: string;
  mime: string;
  size_bytes: number;
};

export type AttachmentRow = AttachmentInput & {
  id: number;
  request_id: number;
  message_id: number | null;
  created_at: string;
};

export type CreateRequestInput = NewRequestInput & {
  requester_name: string;
  requester_email: string;
};

export type Department = { id: number; name: string; created_at: string };
export type Application = { id: number; name: string; created_at: string };
export type ModuleRow = { id: number; department_id: number; name: string; created_at: string };
export type DepartmentWithModules = { id: number; name: string; modules: { id: number; name: string }[] };
export type SubscriberRow = {
  id: number;
  request_id: number;
  email: string;
  added_by_email: string;
  created_at: string;
};

export type Repo = ReturnType<typeof makeRepo>;

export function makeRepo(db: Database) {
  const insertAttachments = (
    requestId: number,
    messageId: number | null,
    attachments: AttachmentInput[],
    createdAt: string,
  ) => {
    for (const a of attachments) {
      db.query(
        `INSERT INTO attachments
         (request_id, message_id, storage_key, original_name, mime, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(requestId, messageId, a.storage_key, a.original_name, a.mime, a.size_bytes, createdAt);
    }
  };

  return {
    createRequest(
      input: CreateRequestInput,
      createdAt: string,
      attachments: AttachmentInput[] = [],
      relatedDepartments: string[] = [],
    ): RequestRow {
      const tx = db.transaction(() => {
        const row = db
          .query<{ c: number }, []>("SELECT COUNT(*) AS c FROM requests")
          .get()!;
        const requestNo = formatRequestNo(row.c + 1);
        const inserted = db
          .query<RequestRow, any>(
            `INSERT INTO requests
             (request_no, created_at, requester_name, requester_email,
              department, application, module_area, request_type, title,
              description, expected_benefit, priority, status)
             VALUES ($no,$at,$name,$email,$dept,$app,$mod,$type,$title,
                     $desc,$benefit,$prio,'new')
             RETURNING *`,
          )
          .get({
            $no: requestNo,
            $at: createdAt,
            $name: input.requester_name,
            $email: input.requester_email,
            $dept: input.department,
            $app: input.application,
            $mod: input.module_area ?? "",
            $type: input.request_type,
            $title: input.title,
            $desc: input.description,
            $benefit: input.expected_benefit,
            $prio: input.priority,
          });
        insertAttachments(inserted!.id, null, attachments, createdAt);
        for (const name of relatedDepartments) {
          db.query(
            `INSERT OR IGNORE INTO request_departments (request_id, department, created_at)
             VALUES (?, ?, ?)`,
          ).run(inserted!.id, name, createdAt);
        }
        return inserted!;
      });
      return tx();
    },

    getRequest(id: number): RequestRow | null {
      return (
        db
          .query<RequestRow, [number]>("SELECT * FROM requests WHERE id = ?")
          .get(id) ?? null
      );
    },

    listByEmail(email: string): RequestRow[] {
      return db
        .query<RequestRow, [string]>(
          `SELECT r.*, COALESCE(MAX(m.created_at), r.created_at) AS last_activity_at
           FROM requests r
           LEFT JOIN messages m ON m.request_id = r.id
           WHERE r.requester_email = ?
           GROUP BY r.id
           ORDER BY r.id DESC`,
        )
        .all(email);
    },

    listAll(filter: { status?: string; priority?: string; department?: string }): RequestRow[] {
      const clauses: string[] = [];
      const params: Record<string, string> = {};
      if (filter.status) {
        clauses.push("status = $status");
        params.$status = filter.status;
      }
      if (filter.priority) {
        clauses.push("priority = $priority");
        params.$priority = filter.priority;
      }
      if (filter.department) {
        clauses.push(
          "(department = $dept OR EXISTS (SELECT 1 FROM request_departments rd WHERE rd.request_id = requests.id AND rd.department = $dept))",
        );
        params.$dept = filter.department;
      }
      if (clauses.length === 0) {
        return db
          .query<RequestRow, []>("SELECT * FROM requests ORDER BY id DESC")
          .all();
      }
      const where = `WHERE ${clauses.join(" AND ")}`;
      return db
        .query<RequestRow, Record<string, string>>(
          `SELECT * FROM requests ${where} ORDER BY id DESC`,
        )
        .all(params);
    },

    /** Every request with its last-activity timestamp (latest message, else created_at). */
    listForStats(): StatsRow[] {
      return db
        .query<StatsRow, []>(
          `SELECT r.id, r.request_no, r.title, r.status, r.priority, r.created_at,
                  COALESCE(MAX(m.created_at), r.created_at) AS last_activity_at
           FROM requests r
           LEFT JOIN messages m ON m.request_id = r.id
           GROUP BY r.id
           ORDER BY r.id DESC`,
        )
        .all();
    },

    addMessage(
      requestId: number,
      role: "admin" | "requester",
      body: string,
      createdAt: string,
    ): void {
      db.query(
        `INSERT INTO messages (request_id, author_role, body, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(requestId, role, body, createdAt);
    },

    listMessages(requestId: number): MessageRow[] {
      return db
        .query<MessageRow, [number]>(
          "SELECT * FROM messages WHERE request_id = ? ORDER BY id ASC",
        )
        .all(requestId);
    },

    listAttachmentsByRequest(requestId: number): AttachmentRow[] {
      return db
        .query<AttachmentRow, [number]>(
          "SELECT * FROM attachments WHERE request_id = ? ORDER BY id ASC",
        )
        .all(requestId);
    },

    getAttachment(id: number): AttachmentRow | null {
      return (
        db
          .query<AttachmentRow, [number]>("SELECT * FROM attachments WHERE id = ?")
          .get(id) ?? null
      );
    },

    updateStatus(id: number, status: RequestStatus): void {
      const current = db
        .query<{ status: RequestStatus }, [number]>(
          "SELECT status FROM requests WHERE id = ?",
        )
        .get(id);
      if (!current) throw new Error(`request ${id} not found`);
      if (!canTransition(current.status, status)) {
        throw new Error(`illegal transition ${current.status} -> ${status}`);
      }
      db.query("UPDATE requests SET status = ? WHERE id = ?").run(status, id);
    },

    createDepartment(name: string, createdAt: string): Department {
      return db.query(
        `INSERT INTO departments (name, created_at) VALUES (?, ?) RETURNING *`,
      ).get(name, createdAt) as Department;
    },
    deleteDepartment(id: number): void {
      db.query(`DELETE FROM departments WHERE id = ?`).run(id);
    },
    getDepartment(id: number): Department | null {
      return (db.query(`SELECT * FROM departments WHERE id = ?`).get(id) as Department) ?? null;
    },
    getDepartmentByName(name: string): Department | null {
      return (db.query(`SELECT * FROM departments WHERE name = ?`).get(name) as Department) ?? null;
    },
    createModule(departmentId: number, name: string, createdAt: string): ModuleRow {
      return db.query(
        `INSERT INTO modules (department_id, name, created_at) VALUES (?, ?, ?) RETURNING *`,
      ).get(departmentId, name, createdAt) as ModuleRow;
    },
    deleteModule(id: number): void {
      db.query(`DELETE FROM modules WHERE id = ?`).run(id);
    },
    getModule(id: number): ModuleRow | null {
      return (db.query(`SELECT * FROM modules WHERE id = ?`).get(id) as ModuleRow) ?? null;
    },
    listModuleNames(departmentId: number): string[] {
      return (db.query(`SELECT name FROM modules WHERE department_id = ? ORDER BY name`)
        .all(departmentId) as { name: string }[]).map((r) => r.name);
    },
    listDepartmentsWithModules(): DepartmentWithModules[] {
      const depts = db.query(`SELECT * FROM departments ORDER BY name`).all() as Department[];
      return depts.map((d) => ({
        id: d.id,
        name: d.name,
        modules: db.query(`SELECT id, name FROM modules WHERE department_id = ? ORDER BY name`)
          .all(d.id) as { id: number; name: string }[],
      }));
    },

    createApplication(name: string, createdAt: string): Application {
      return db.query(
        `INSERT INTO applications (name, created_at) VALUES (?, ?) RETURNING *`,
      ).get(name, createdAt) as Application;
    },
    deleteApplication(id: number): void {
      db.query(`DELETE FROM applications WHERE id = ?`).run(id);
    },
    getApplication(id: number): Application | null {
      return (db.query(`SELECT * FROM applications WHERE id = ?`).get(id) as Application) ?? null;
    },
    getApplicationByName(name: string): Application | null {
      return (db.query(`SELECT * FROM applications WHERE name = ?`).get(name) as Application) ?? null;
    },
    listApplications(): Application[] {
      return db.query(`SELECT * FROM applications ORDER BY name`).all() as Application[];
    },

    addSubscriber(
      requestId: number,
      email: string,
      addedByEmail: string,
      createdAt: string,
    ): SubscriberRow | null {
      const e = email.trim().toLowerCase();
      const by = addedByEmail.trim().toLowerCase();
      const existing = db
        .query<SubscriberRow, [number, string]>(
          "SELECT * FROM subscribers WHERE request_id = ? AND email = ?",
        )
        .get(requestId, e);
      if (existing) return null;
      return db
        .query<SubscriberRow, any>(
          `INSERT INTO subscribers (request_id, email, added_by_email, created_at)
           VALUES (?, ?, ?, ?) RETURNING *`,
        )
        .get(requestId, e, by, createdAt) as SubscriberRow;
    },

    removeSubscriber(requestId: number, email: string): boolean {
      const res = db
        .query("DELETE FROM subscribers WHERE request_id = ? AND email = ?")
        .run(requestId, email.trim().toLowerCase());
      return res.changes > 0;
    },

    isSubscriber(requestId: number, email: string): boolean {
      const row = db
        .query<{ id: number }, [number, string]>(
          "SELECT id FROM subscribers WHERE request_id = ? AND email = ?",
        )
        .get(requestId, email.trim().toLowerCase());
      return row != null;
    },

    listSubscribers(requestId: number): SubscriberRow[] {
      return db
        .query<SubscriberRow, [number]>(
          "SELECT * FROM subscribers WHERE request_id = ? ORDER BY id ASC",
        )
        .all(requestId);
    },

    listRelatedDepartments(requestId: number): string[] {
      return db
        .query<{ department: string }, [number]>(
          "SELECT department FROM request_departments WHERE request_id = ? ORDER BY department",
        )
        .all(requestId)
        .map((r) => r.department);
    },

    addMessageAndTransition(
      requestId: number,
      message: { role: "admin" | "requester"; body: string } | null,
      newStatus: RequestStatus,
      createdAt: string,
      attachments: AttachmentInput[] = [],
    ): void {
      const run = db.transaction(() => {
        const current = db
          .query<{ status: RequestStatus }, [number]>(
            "SELECT status FROM requests WHERE id = ?",
          )
          .get(requestId);
        if (!current) throw new Error(`request ${requestId} not found`);
        if (!canTransition(current.status, newStatus)) {
          throw new Error(`illegal transition ${current.status} -> ${newStatus}`);
        }
        let messageId: number | null = null;
        if (message) {
          const res = db.query(
            `INSERT INTO messages (request_id, author_role, body, created_at)
             VALUES (?, ?, ?, ?)`,
          ).run(requestId, message.role, message.body, createdAt);
          messageId = Number(res.lastInsertRowid);
        }
        db.query("UPDATE requests SET status = ? WHERE id = ?").run(
          newStatus,
          requestId,
        );
        insertAttachments(requestId, messageId, attachments, createdAt);
      });
      run();
    },
  };
}
