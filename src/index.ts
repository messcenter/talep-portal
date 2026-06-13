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

    // Compiled CSS. The split client bundle (entry main.js + hashed chunk-*.js)
    // is served by the fetch handler below, since chunk names are not known here.
    "/app.css": appCss,
  },

  // Everything else: API, auth, logout, attachments, and any remaining GET
  // that browsers navigate to (history API deep links not covered by routes above).
  fetch: async (req) => {
    // Serve the split client bundle: entry `main.js` plus hashed `chunk-*.js`
    // files emitted by `bun build --splitting`. The pattern matches a single
    // path segment ending in `.js` (no "/"), so it cannot traverse outside
    // publicDir; non-existent names fall through to the API handler / 404.
    if (req.method === "GET") {
      const { pathname } = new URL(req.url);
      if (/^\/[\w.-]+\.js$/.test(pathname)) {
        const file = Bun.file(join(publicDir, pathname.slice(1)));
        if (await file.exists()) {
          return new Response(file, {
            headers: { "content-type": "text/javascript; charset=utf-8" },
          });
        }
      }
    }

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
