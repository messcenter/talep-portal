// src/config.ts
import { z } from "zod";

const ConfigSchema = z.object({
  port: z.coerce.number().int().positive().default(3000),
  appBaseUrl: z.string().url(),
  sessionSecret: z.string().min(16),
  googleClientId: z.string().min(1),
  googleClientSecret: z.string().min(1),
  googleHostedDomain: z.string().min(1),
  adminEmails: z
    .string()
    .transform((s) =>
      s
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  smtpHost: z.string().min(1),
  smtpPort: z.coerce.number().int().positive(),
  smtpSecure: z
    .string()
    .transform((s) => s === "true")
    .pipe(z.boolean()),
  smtpUser: z.string().default(""),
  smtpPass: z.string().default(""),
  mailFrom: z.string().min(1),
  dbPath: z.string().default("data.db"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined>): Config {
  return ConfigSchema.parse({
    port: env.PORT,
    appBaseUrl: env.APP_BASE_URL,
    sessionSecret: env.SESSION_SECRET,
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    googleHostedDomain: env.GOOGLE_HOSTED_DOMAIN,
    adminEmails: env.ADMIN_EMAILS ?? "",
    smtpHost: env.SMTP_HOST,
    smtpPort: env.SMTP_PORT,
    smtpSecure: env.SMTP_SECURE ?? "false",
    smtpUser: env.SMTP_USER,
    smtpPass: env.SMTP_PASS,
    mailFrom: env.MAIL_FROM,
    dbPath: env.DB_PATH,
  });
}
