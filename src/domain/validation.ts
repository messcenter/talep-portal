// src/domain/validation.ts
import { z } from "zod";

export const REQUEST_TYPES = ["feature", "bug", "task"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;

const req = (max: number, label: string) =>
  z.string().trim().min(1, `${label} gerekli`).max(max, `${label} en fazla ${max} karakter olabilir`);

export const newRequestSchema = z.object({
  department: req(120, "Departman"),
  application: req(120, "Uygulama"),
  module_area: z.string().trim().max(120, "Modül/alan en fazla 120 karakter olabilir").optional().default(""),
  request_type: z.enum(REQUEST_TYPES, { message: "Talep türü seçiniz" }),
  title: req(200, "Başlık"),
  description: req(5000, "Açıklama"),
  expected_benefit: req(2000, "Beklenen fayda"),
  priority: z.enum(PRIORITIES, { message: "Öncelik seçiniz" }),
});
export type NewRequestInput = z.infer<typeof newRequestSchema>;

export const replySchema = z.object({ body: req(5000, "Cevap") });
export const messageSchema = z.object({ body: req(5000, "Soru") });

export const decisionSchema = z
  .object({
    decision: z.enum(["accept", "reject"], { message: "Geçersiz karar" }),
    reason: z.string().trim().max(2000, "Gerekçe en fazla 2000 karakter olabilir").optional(),
  })
  .refine((d) => d.decision !== "reject" || !!d.reason, {
    message: "Ret için gerekçe gerekli",
    path: ["reason"],
  });
export type DecisionInput = z.infer<typeof decisionSchema>;
