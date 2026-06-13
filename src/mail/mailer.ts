// src/mail/mailer.ts
import nodemailer from "nodemailer";
import type { Config } from "../config";

export type Transport = {
  sendMail(msg: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<unknown>;
};

export function makeMailer(transport: Transport, from: string) {
  return {
    async send(to: string, subject: string, html: string, text?: string): Promise<void> {
      try {
        await transport.sendMail({ from, to, subject, html, ...(text !== undefined ? { text } : {}) });
      } catch (err) {
        console.error(`[mail] gönderilemedi to=${to} subject=${subject}`, err);
      }
    },
  };
}

export function transportFromConfig(cfg: Config): Transport {
  return nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure,
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
  }) as unknown as Transport;
}

export type Mailer = ReturnType<typeof makeMailer>;
