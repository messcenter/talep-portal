// src/domain/validation.ts
import { z } from "zod";

const nonBlank = (max: number) =>
  z.string().trim().min(1).max(max);

export const REQUEST_TYPES = ["feature", "bug", "task"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;

export const newRequestSchema = z.object({
  department: nonBlank(120),
  application: nonBlank(120),
  module_area: z.string().trim().max(120).optional().default(""),
  request_type: z.enum(REQUEST_TYPES),
  title: nonBlank(200),
  description: nonBlank(5000),
  expected_benefit: nonBlank(2000),
  priority: z.enum(PRIORITIES),
});
export type NewRequestInput = z.infer<typeof newRequestSchema>;

export const replySchema = z.object({
  body: nonBlank(5000),
});

export const messageSchema = z.object({
  body: nonBlank(5000),
});

export const decisionSchema = z
  .object({
    decision: z.enum(["accept", "reject"]),
    reason: z.string().trim().max(2000).optional(),
  })
  .refine((d) => d.decision !== "reject" || !!d.reason, {
    message: "reject requires reason",
    path: ["reason"],
  });
export type DecisionInput = z.infer<typeof decisionSchema>;
