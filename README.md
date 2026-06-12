# Talep Portalı

Çalışan talebi toplama + netleştirme + kabul/ret portalı. Bun + Hono + SQLite.

## Kurulum
1. `bun install`
2. `cp .env.example .env` ve değerleri doldur (Google OAuth, Zoho SMTP, admin e-postaları).
3. Google Cloud Console: OAuth 2.0 Client → redirect URI `${APP_BASE_URL}/auth/google/callback`.
4. `bun run dev` (geliştirme) veya `bun run start` (üretim).

## Test
`bun test`

## Yedekleme
`data.db` dosyasını kopyala.
