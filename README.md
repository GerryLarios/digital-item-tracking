# Registered Backlog Items

Single-user backlog tracker for anime, games, and adjacent media built with Next.js 16 App Router, Drizzle, Better Auth, SQLite, local media storage, Steam sync, and MyAnimeList sync.

## MVP features

- One-time account setup, email/password sign-in, protected routes, and authenticated media access.
- Drizzle-managed SQLite schema under `DATA_DIR`, generated SQL migrations, and a backup script.
- Manual library CRUD with repeatable attributes, ownership locations, external links, search, filters, grid/list views, and delete confirmation.
- Local artwork upload plus provider artwork caching with original and thumbnail variants.
- Steam owned library and wishlist sync through the Steam Web API.
- MyAnimeList OAuth connect flow plus list, favorites, and profile import.
- Provider reconciliation that preserves local overrides and keeps run history.
- Durable, restart-safe bulk item-detail refresh with progress and failed-item retry.
- Versioned full-library JSON import/export with additive relationship merging.
- Manual provider sync with database leases, run history, and integration settings UI.
- Targeted Vitest coverage for auth bootstrap, CRUD, image validation, MAL mapping, sync leases, and Steam idempotency.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Set `BETTER_AUTH_SECRET` and `APP_ENCRYPTION_KEY` for your environment.
3. Optionally configure `STEAM_API_KEY`, `MAL_CLIENT_ID`, and `MAL_CLIENT_SECRET`.
4. Install and start:

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

Mutable state lives under `DATA_DIR` (default `./.data`):

- `app.db` — SQLite database
- `media/originals` — original uploads/downloads
- `media/thumbnails` — generated thumbnails
- `backups` — script-created backups

The Library page can export all item data to JSON and import archives up to
100 MB. Matching items are merged by node or provider identity. Credentials and
image files are not included; provider artwork can be restored with detail sync.

## Commands

```bash
pnpm db:bootstrap # delete and recreate DATA_DIR/app.db; stop the server first
pnpm db:generate   # generate SQL from the Drizzle schema
pnpm db:migrate    # apply migrations to DATA_DIR/app.db
pnpm db:backup     # snapshot app.db plus media into DATA_DIR/backups
pnpm test          # run targeted Vitest coverage
pnpm lint          # ESLint
pnpm typecheck     # TypeScript
pnpm build         # production build
```

## Integrations

### Steam

- `STEAM_API_KEY` is required.
- In **Settings → Integrations**, store the numeric SteamID64.
- For a private wishlist, paste a signed-out-accessible Steam wishlist share URL;
  it is encrypted and used only when the API cannot expose the wishlist.
- Owned library sync uses `IPlayerService/GetOwnedGames`.
- Wishlist sync uses `IWishlistService/GetWishlist`; the Steam profile and Game
  details visibility must permit access.

### MyAnimeList

- Set `MAL_CLIENT_ID`, `MAL_CLIENT_SECRET`, and (optionally) `MAL_REDIRECT_URI`.
- Register the callback URL shown in `.env.example` with MAL.
- Use **Connect MAL** from **Settings → Integrations**.
- Tokens are stored encrypted with `APP_ENCRYPTION_KEY`.

## Deployment

This app assumes a long-running Node.js process with a persistent writable volume. Serverless/ephemeral filesystems are out of scope.

### Docker

Build and run with a mounted data volume:

```bash
docker build -t registered-backlog-items .
docker run   -p 3000:3000   -e APP_ORIGIN=http://localhost:3000   -e BETTER_AUTH_SECRET=change-me   -e APP_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef   -e STEAM_API_KEY=optional   -e MAL_CLIENT_ID=optional   -e MAL_CLIENT_SECRET=optional   -v "$PWD/.data:/data"   registered-backlog-items
```

The container entrypoint runs `pnpm db:migrate` before starting the standalone server.

### Health check

`GET /api/health` returns database health and whether the bulk detail worker started.

## Backup and restore

Create a backup:

```bash
pnpm db:backup
```

Restore by stopping the app, copying the backup's `app.db` and `media/` back into `DATA_DIR`, then starting the app again. The backup script captures both the database and local artwork so restores remain consistent.

## Notes and limitations

- Auth secrets fall back to local defaults for development and tests. Production
  startup fails unless `BETTER_AUTH_SECRET` and `APP_ENCRYPTION_KEY` are set.
- MyAnimeList favorites/profile import is best-effort because the upstream payload can vary.
- Steam may return an inaccessible wishlist when Profile or Game details privacy
  blocks the configured API key; owned-library sync still completes.
- Provider library sync is manual-only. Database leases prevent overlapping manual
  runs for the same provider.
- Bulk item-detail jobs are stored in SQLite but processed by that same long-lived
  Node.js instance; serverless and horizontally scaled deployments are not supported.
