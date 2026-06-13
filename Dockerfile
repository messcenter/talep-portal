# syntax=docker/dockerfile:1

# ── Build stage: install deps and bundle the client (public/) ────────────────
FROM oven/bun:1.3 AS build
WORKDIR /app

# Install dependencies against the committed lockfile first (better layer cache).
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy the rest and produce the client bundle + CSS + HTML into public/.
COPY . .
RUN bun run build

# ── Runtime stage: server + built assets, no build toolchain ─────────────────
FROM oven/bun:1.3-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    DB_PATH=/data/data.db \
    UPLOAD_DIR=/data/uploads

# App code, installed deps and the built public/ from the build stage.
COPY --from=build /app /app

# Persistent state (SQLite db + uploads) lives in /data — a mounted volume,
# writable by the unprivileged "bun" user the image ships with.
RUN mkdir -p /data/uploads && chown -R bun:bun /data
USER bun

EXPOSE 3000

# Liveness: the SPA shell on "/" is served without auth and returns 200.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Assets are already built; just run the server.
CMD ["bun", "src/index.ts"]
