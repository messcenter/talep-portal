import { expect, test } from "bun:test";
import { loadConfig } from "./config";

const base = {
  APP_BASE_URL: "http://localhost:3000",
  SESSION_SECRET: "test-secret-16chars-min",
  GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec",
  GOOGLE_HOSTED_DOMAIN: "kokilmetal.com.tr",
  ADMIN_EMAILS: "boss@kokilmetal.com.tr",
  SMTP_HOST: "smtp.zoho.com", SMTP_PORT: "465", SMTP_SECURE: "true",
  MAIL_FROM: "From <f@k.com>",
};

test("uploadDir defaults to 'uploads'", () => {
  expect(loadConfig(base).uploadDir).toBe("uploads");
});
test("uploadDir reads UPLOAD_DIR", () => {
  expect(loadConfig({ ...base, UPLOAD_DIR: "/data/up" }).uploadDir).toBe("/data/up");
});
