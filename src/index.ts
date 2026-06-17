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

// The SPA shell and the stable-named CSS are rewritten in place on every build,
// so they must always revalidate — otherwise a cached shell pins the client to a
// stale bundle. (Hashed JS chunks are content-addressed and cached forever below.)
const serveShell = () =>
  new Response(spaShell, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
  });
const serveCss = () =>
  new Response(appCss, {
    headers: { "content-type": "text/css; charset=utf-8", "cache-control": "no-cache" },
  });

Bun.serve({
  port: config.port,
  maxRequestBodySize: 110 * 1024 * 1024, // authoritative upload cap

  // Static asset routes resolved before fetch.
  routes: {
    // SPA entry point for top-level navigation paths.
    "/": serveShell,
    "/yeni": serveShell,
    "/my": serveShell,
    "/admin": serveShell,
    "/admin/talepler": serveShell,
    "/admin/pano": serveShell,
    "/admin/tanimlar": serveShell,
    // NOTE: /requests/:id is a single-segment param route — it will NOT match
    // /requests/:id/attachments/:attId (3 extra segments), so attachments fall
    // through to the fetch handler correctly.
    "/requests/:id": serveShell,
    // Admin detail deep-link; different prefix from /requests/:id/attachments/...
    "/admin/requests/:id": serveShell,

    // Compiled CSS. The split client bundle (entry main.js + hashed chunk-*.js)
    // is served by the fetch handler below, since chunk names are not known here.
    "/app.css": serveCss,
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
          // Hashed chunks (e.g. Dashboard-a1b2c3d4.js) are content-addressed, so
          // cache them forever. The stable entry `main.js` is rewritten in place
          // on every rebuild → it must always revalidate, otherwise the browser
          // keeps running a stale bundle that imports now-deleted chunks and the
          // requests hang in "pending".
          const isHashedChunk = /-[a-z0-9]{8,}\.js$/.test(pathname);
          return new Response(file, {
            headers: {
              "content-type": "text/javascript; charset=utf-8",
              "cache-control": isHashedChunk
                ? "public, max-age=31536000, immutable"
                : "no-cache",
            },
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
          headers: {
            "content-type": "text/html; charset=utf-8",
            // Never cache the SPA shell: it points at the stable `main.js`, which
            // must be re-fetched so deep-link reloads pick up the latest bundle.
            "cache-control": "no-cache",
          },
        });
      }
    }

    return res;
  },
});
console.log(`Talep Portalı çalışıyor: ${config.appBaseUrl} (port ${config.port})`);
