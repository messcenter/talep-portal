import { loadConfig } from "./config";
import { openDb } from "./db/db";
import { makeRepo } from "./db/repo";
import { makeMailer, transportFromConfig } from "./mail/mailer";
import { makeFsStorage } from "./storage/storage";
import { makeHandler } from "./server/handler";
import { join } from "node:path";

const config = loadConfig(process.env);
const db = openDb(config.dbPath);
const repo = makeRepo(db);
const mailer = makeMailer(transportFromConfig(config), config.mailFrom);
const storage = makeFsStorage(config.uploadDir);
const handler = makeHandler({ config, repo, mailer, storage, now: () => new Date().toISOString() });

// Resolve paths to pre-built static assets (produced by `bun run build`).
// __dirname is not available in ESM; use import.meta.dir instead.
const publicDir = join(import.meta.dir, "..", "public");
const spaShell = Bun.file(join(publicDir, "index.html"));
const clientJs = Bun.file(join(publicDir, "client.js"));
const appCss = Bun.file(join(publicDir, "app.css"));

Bun.serve({
  port: config.port,
  maxRequestBodySize: 110 * 1024 * 1024, // authoritative upload cap

  // Static asset routes resolved before fetch.
  routes: {
    // SPA entry point for top-level navigation paths.
    "/": spaShell,
    "/yeni": spaShell,
    "/my": spaShell,
    "/admin": spaShell,
    "/admin/tanimlar": spaShell,
    // NOTE: /requests/:id is a single-segment param route — it will NOT match
    // /requests/:id/attachments/:attId (3 extra segments), so attachments fall
    // through to the fetch handler correctly.
    "/requests/:id": spaShell,
    // Admin detail deep-link; different prefix from /requests/:id/attachments/...
    "/admin/requests/:id": spaShell,

    // Pre-built client bundle and compiled CSS.
    "/client.js": clientJs,
    "/app.css": appCss,
  },

  // Everything else: API, auth, logout, attachments, and any remaining GET
  // that browsers navigate to (history API deep links not covered by routes above).
  fetch: async (req) => {
    const res = await handler(req);

    // SPA fallback: if the backend returned 404 and the browser is requesting
    // a document (Accept: text/html), serve the SPA shell so client-side
    // routing can take over.
    if (res.status === 404) {
      const accept = req.headers.get("accept") ?? "";
      if (accept.includes("text/html")) {
        return new Response(spaShell, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
    }

    return res;
  },
});
console.log(`Talep Portalı çalışıyor: ${config.appBaseUrl} (port ${config.port})`);
