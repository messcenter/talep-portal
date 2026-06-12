// src/db/repo.ts
import type { Database } from "bun:sqlite";
import { formatRequestNo } from "../domain/request-no";
import { canTransition, type RequestStatus } from "../domain/status";
import type { NewRequestInput } from "../domain/validation";

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
};

export type MessageRow = {
  id: number;
  request_id: number;
  author_role: "admin" | "requester";
  body: string;
  created_at: string;
};

export type CreateRequestInput = NewRequestInput & {
  requester_name: string;
  requester_email: string;
};

export type Repo = ReturnType<typeof makeRepo>;

export function makeRepo(db: Database) {
  return {
    createRequest(input: CreateRequestInput, createdAt: string): RequestRow {
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
          "SELECT * FROM requests WHERE requester_email = ? ORDER BY id DESC",
        )
        .all(email);
    },

    listAll(filter: { status?: string; priority?: string }): RequestRow[] {
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

    addMessageAndTransition(
      requestId: number,
      message: { role: "admin" | "requester"; body: string } | null,
      newStatus: RequestStatus,
      createdAt: string,
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
        if (message) {
          db.query(
            `INSERT INTO messages (request_id, author_role, body, created_at)
             VALUES (?, ?, ?, ?)`,
          ).run(requestId, message.role, message.body, createdAt);
        }
        db.query("UPDATE requests SET status = ? WHERE id = ?").run(
          newStatus,
          requestId,
        );
      });
      run();
    },
  };
}
