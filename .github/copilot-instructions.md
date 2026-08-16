# Digital Item Tracking

## Commands

Use pnpm 11.5.0; the version is pinned in `package.json`.

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test

# Run one test file or one named test.
pnpm exec vitest run src/lib/sync/__tests__/item-details.test.ts
pnpm exec vitest run src/lib/sync/__tests__/item-details.test.ts -t "maps Steam details"

pnpm db:generate   # generate a migration after changing src/lib/db/schema.ts
pnpm db:migrate    # apply pending migrations
pnpm db:backup     # back up SQLite and media together
pnpm db:bootstrap # destructive: stop the server, then recreate only app.db
```

Tests use a migrated `.test-data` SQLite database, run serially, reset all
tables and media before each test, and remove test data afterward.

## Next.js version

This repository uses Next.js 16.3.1 and React 19. Before changing Next.js APIs,
conventions, or file structure, read the relevant bundled guide under
`node_modules/next/dist/docs/`. Preserve the generated rule in `AGENTS.md`;
`CLAUDE.md` imports it.

## Architecture

- This is a single-user App Router monolith. `src/app/(app)/layout.tsx`
  authenticates the protected application; public auth/setup pages and route
  handlers live outside that group.
- Server Actions in `src/app/actions/` authenticate with `requireSession()`.
  Route handlers authenticate from request headers with
  `getSessionFromHeaders()`. Treat both as public mutation boundaries and
  validate their inputs.
- `src/lib/db/schema.ts` is the source of truth for Drizzle/SQLite. Shared enum
  values and their TypeScript types live in `src/lib/constants.ts`. Timestamps
  are stored as millisecond integers and exposed as `Date` objects.
- Library aggregates are nodes plus attributes, storage locations, external
  references, links, and images. Library reads/manual writes belong in
  `src/lib/library/`; HTTP/UI layers should call those services rather than
  reproduce persistence logic.
- Provider modules map Steam and MyAnimeList payloads into
  `RemoteCatalogItem`. `src/lib/sync/service.ts` owns reconciliation,
  membership snapshots, local-override preservation, provider attributes,
  storage, metadata, and managed artwork. Reuse `reconcileRemoteItem()` rather
  than writing provider-specific database updates elsewhere.
- `external_refs` is both provider identity and collection membership.
  `list_memberships` and `source_data` are JSON text. Parse them with
  `parseJson()` and merge membership arrays with `uniqueValues()`. Exact
  membership filters use SQLite `json_each`, not substring matching.
- Item-detail refresh uses `src/lib/sync/item-details.ts`. Bulk detail refresh
  snapshots work into SQLite job/item tables and is processed sequentially by
  `detail-worker.ts`.
- `src/instrumentation.ts` starts the detail worker in the Node runtime.
  Provider library sync is manual-only. The deployment model is one long-lived
  Node process with a persistent writable `DATA_DIR`; it is not serverless or
  horizontally scaled.
- Artwork is normalized by Sharp and stored under `DATA_DIR/media`.
  Database image rows point to managed files, and `/media/[imageId]` serves
  them only after authentication. Never put private media in `public/` or
  create image rows without corresponding files.

## Repository conventions

- Server-only service modules begin with `import "@/lib/server-only"`.
- Keep provider credentials in `sync_accounts`; tokens and private Steam
  wishlist URLs use the encryption helpers. Never expose them through pages,
  exports, logs, or provider metadata.
- Manual edits add fields to `nodes.override_fields`. Provider reconciliation
  must continue respecting those overrides, including the image override.
- Detail-only sync must preserve memberships and ownership storage. Only
  replace provider storage when a payload explicitly supplies
  `storageLocations`.
- A provider failure may be best-effort when another source succeeds. Preserve
  successful updates and return/store actionable warnings rather than rolling
  them back.
- Library JSON transfer is versioned and validated in
  `src/lib/library/transfer-schema.ts`. Imports merge matched nodes
  transactionally, deduplicate relationships by their documented natural
  keys, and never import image rows because image binaries are excluded.
- Generate and commit both the SQL migration and Drizzle metadata after schema
  changes. The Docker entrypoint applies migrations before starting the
  standalone server.
- Mutable state belongs under `DATA_DIR` (default `.data`), not the repository
  or Next.js build output. Backups must include both `app.db` and `media/`.
- Use shadcn components from `src/components/ui/` and existing Tailwind theme
  tokens such as `background`, `foreground`, and `muted`; do not add a parallel
  component or color system.
