<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Digital Item Tracking

Single-user backlog tracker (anime/games/media): Next.js 16 App Router monolith, Drizzle + better-sqlite3, Better Auth, local media storage, Steam/MAL sync. Deeper detail lives in `.github/copilot-instructions.md`.

## Commands

Use pnpm (pinned `pnpm@11.5.0`). Verify with all of `pnpm lint`, `pnpm typecheck`, `pnpm test`.

- Dev/build: `pnpm dev`, `pnpm build`, `pnpm start`.
- Tests: `pnpm test` (Vitest). One file: `pnpm exec vitest run src/lib/sync/__tests__/item-details.test.ts`; one named test: add `-t "maps Steam details"`.
- Schema changes: edit `src/lib/db/schema.ts`, then `pnpm db:generate` then `pnpm db:migrate`. Commit both the SQL in `drizzle/` and the `drizzle/meta` snapshot.
- `pnpm db:bootstrap` DELETES `DATA_DIR/app.db` — stop the dev server first.
- `pnpm db:backup` snapshots `app.db` and media together (restores need both).
- `pnpm db:backfill:anime-nsfw` marks ANIME nodes NSFW when a stored genre is in `NSFW_GENRES`.
- `pnpm db:backfill:steam-nsfw` reconciles NSFW from stored Steam payloads via `isSteamNsfw`.

## Env & data

- Config is centrally parsed/cached in `src/lib/env.ts` (zod). Read via `getEnv()`, not `process.env` (direct reads are only runtime/NODE_ENV checks). After mutating env in tests, call `resetEnvCache()`.
- Dev/test fall back to default secrets; production startup throws without `BETTER_AUTH_SECRET` and a ≥32-byte `APP_ENCRYPTION_KEY`. `.env` is gitignored.
- All mutable state lives under `DATA_DIR` (default `./.data`, gitignored): `app.db`, `media/{originals,thumbnails}`, `backups`. Tests use `.test-data`.
- `NSFW_GENRES` (comma-separated, read via `getEnv().nsfwGenres`) marks MAL items NSFW at sync; empty disables genre-based flagging.

## Architecture

- Protected app is in `src/app/(app)/`; public auth/setup pages and route handlers are outside it.
- Server Actions use `requireSession()`; route handlers use `getSessionFromHeaders()` (`src/lib/auth.ts`). Both are public mutation boundaries — validate inputs.
- `src/lib/db/schema.ts` is the schema source of truth; timestamps are stored as millisecond integers, exposed as `Date`. Shared enums/types live in `src/lib/constants.ts`.
- Server-only modules start with `import "@/lib/server-only"` (Vitest aliases it to `test-support/server-only.ts`).
- Provider reconciliation is owned by `reconcileRemoteItem()` in `src/lib/sync/service.ts`; library reads/writes belong in `src/lib/library/service.ts`. Don't write provider-specific DB updates elsewhere.
- `external_refs` is provider identity AND collection membership; `list_memberships`/`source_data` are JSON text — parse with `parseJson()`, filter with `json_each`.
- Artwork is managed under `DATA_DIR/media` and served by `/media/[imageId]` after auth. Never put private media in `public/`.
- Bulk detail refresh persists jobs to SQLite and is processed sequentially by the worker started in `src/instrumentation.ts`. Deployment = one long-lived Node process with a persistent `DATA_DIR`; not serverless.

## Tests

- Vitest runs serially (`maxWorkers: 1`). Uses a real migrated `.test-data` SQLite DB, wipes tables + media before each test, removes afterward. No external services needed.
