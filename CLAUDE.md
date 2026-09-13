# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CloudFlare-ImgBed is a self-hosted image/file hosting platform with multiple storage backends (Telegram, Discord, Cloudflare R2, S3, HuggingFace, WebDAV). It runs in two deployment modes: **Cloudflare Workers/Pages** (serverless) and **Docker** (Node.js). All source code is ES module JavaScript — no TypeScript.

## Architecture

### Two deployment modes, one codebase

- **`functions/`** — Cloudflare Pages Functions (serverless API). This is the primary application logic.
- **`deploy/server/`** — Docker mode: a Hono Node.js server that emulates the Cloudflare runtime. It provides SQLite (via `better-sqlite3`) in place of D1, local filesystem in place of R2, and mocks for `caches`, `request.cf`, etc.
- **`frontend-dist/`** — Pre-built Vue.js SPA (source lives in [MarSeventh/Sanyue-ImgHub](https://github.com/MarSeventh/Sanyue-ImgHub), not in this repo). Do not edit files here; rebuild from the frontend repo.
- **`database/`** — D1/SQLite schema (`init.sql`) and migration scripts (`migrations/`).
- **`deploy/worker/`** — Cloudflare Worker deployment scaffolding (route generation, wrangler.toml generation).

### Key patterns

- **Cloudflare Pages Functions convention**: Each file exports `onRequest(context)` or method-specific handlers (`onRequestGet`, etc.). Middleware is defined in `_middleware.js` files at each directory level and chains automatically. Catch-all routes use `[[path]].js` filenames.
- **Database abstraction** (`functions/utils/databaseAdapter.js`): Unified interface over Cloudflare KV (`env.img_url`) and D1 (`env.img_d1`). Docker mode uses `SqliteD1` (`deploy/server/sqliteD1.js`) which implements the D1 `prepare().bind().first/all/run()` API over `better-sqlite3`.
- **Storage channels** (`functions/utils/storage/`): `telegramAPI.js`, `discordAPI.js`, `huggingfaceAPI.js`, `webdavAPI.js`. Each wraps its platform's API. Channel credentials are resolved at runtime via `functions/utils/metadata/channelCredentials.js`.
- **Upload routing** (`functions/upload/index.js`): Dispatches to channel-specific upload functions, with automatic retry across channels on failure. Supports chunked uploads for large files.
- **File serving** (`functions/file/[[path]].js`): Looks up file metadata in the database, then fetches from the appropriate storage backend. Supports Range requests and image transformations.

### npm workspaces

```
deploy/profiles/common   → @cloudflare-imgbed/common  (shared deps: @aws-sdk/client-s3)
deploy/profiles/server   → @cloudflare-imgbed/server   (Docker deps: hono, better-sqlite3, sharp)
deploy/profiles/worker   → @cloudflare-imgbed/worker   (Worker deps: @cloudflare/pages-plugin-sentry)
```

## Common Commands

```bash
# Local dev with Cloudflare Pages emulation (wrangler, uses KV + R2)
npm start

# Local dev in Docker mode (Node.js + Hono + SQLite)
npm run start:docker

# Run tests
npm test

# CI tests (starts server, waits for ready, runs mocha)
npm run ci-test

# Deploy to Cloudflare Workers
npm run deploy:worker
```

## Environment Bindings

These Cloudflare bindings are expected in the runtime environment (or emulated by the Docker server):

- `env.img_url` — KV namespace (legacy storage)
- `env.img_d1` — D1 database (preferred)
- `env.img_r2` — R2 bucket (file storage)
- `env.IMAGE_PROCESSOR` — Image processing adapter (Docker mode uses `sharp`)

## Frontend Project (Sanyue-ImgHub)

Frontend source lives in a separate repo, typically cloned as `Sanyue-ImgHub/` alongside this project.

- **Tech stack**: Vue.js 3, Element Plus, vue-i18n, Vuex
- **Admin settings component**: `src/components/config/SysCogOthers.vue` — binds form fields to `settings.cloudflareApiToken.*` (keys: `CF_ZONE_ID`, `CF_API_TOKEN`, `CF_EMAIL`, `CF_API_KEY`)
- **i18n locale files**: `src/locales/en.json`, `src/locales/zh-CN.json` — system settings keys live under `sysOthers.*`
- **Build & deploy**:
  ```bash
  cd Sanyue-ImgHub && npm install && npm run build
  cp -r dist/* ../frontend-dist/
  ```
  The built `dist/` output replaces `frontend-dist/` contents. Commit `frontend-dist/` changes into this repo.

## Important Notes

- The frontend is **not built from this repo**. It is a pre-compiled SPA checked into `frontend-dist/`. Frontend source code changes happen in the [Sanyue-ImgHub](https://github.com/MarSeventh/Sanyue-ImgHub) repo.
- When editing API functions in `functions/`, changes work for both Cloudflare deployment and Docker mode — the Docker server (`deploy/server/index.js`) dynamically imports and executes the same `functions/` files.
- The Docker server intercepts `globalThis.fetch` calls to route self-referencing requests (functions calling `url.origin + path`) to the internal server, avoiding issues with external port mapping.
- Database migrations go in `database/migrations/` as numbered `.sql` files. Both D1 and SQLite modes execute them on startup.
- Sentry telemetry is configured in `functions/utils/middleware.js` — it is opt-in via the `othersConfig.telemetry` setting.
