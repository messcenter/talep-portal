import { loadConfig } from "./config";
import { openDb } from "./db/db";
import { makeRepo } from "./db/repo";
import { makeMailer, transportFromConfig } from "./mail/mailer";
import { makeFsStorage } from "./storage/storage";
import { makeHandler } from "./server/handler";

const config = loadConfig(process.env);
const db = openDb(config.dbPath);
const repo = makeRepo(db);
const mailer = makeMailer(transportFromConfig(config), config.mailFrom);
const storage = makeFsStorage(config.uploadDir);
const handler = makeHandler({ config, repo, mailer, storage, now: () => new Date().toISOString() });

Bun.serve({
  port: config.port,
  maxRequestBodySize: 110 * 1024 * 1024, // authoritative upload cap (handler Content-Length check is fast-path only)
  fetch: handler,
});
console.log(`Talep Portalı çalışıyor: ${config.appBaseUrl} (port ${config.port})`);
