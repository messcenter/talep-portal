// src/index.ts
import { loadConfig } from "./config";
import { openDb } from "./db/db";
import { makeRepo } from "./db/repo";
import { makeMailer, transportFromConfig } from "./mail/mailer";
import { makeFsStorage } from "./storage/storage";
import { buildApp } from "./app";

const config = loadConfig(process.env);
const db = openDb(config.dbPath);
const repo = makeRepo(db);
const mailer = makeMailer(transportFromConfig(config), config.mailFrom);
const storage = makeFsStorage(config.uploadDir);
const app = buildApp({
  config,
  repo,
  mailer,
  storage,
  now: () => new Date().toISOString(),
});

console.log(`Talep Portalı çalışıyor: ${config.appBaseUrl} (port ${config.port})`);
export default { port: config.port, fetch: app.fetch };
