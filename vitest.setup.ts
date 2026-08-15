import fs from "node:fs"
import path from "node:path"

import { beforeAll, beforeEach, afterAll } from "vitest"

Object.assign(process.env, {
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:3000",
  DATA_DIR: path.join(process.cwd(), ".test-data"),
  BETTER_AUTH_SECRET: "test-better-auth-secret-registered-backlog",
  APP_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
  STEAM_API_KEY: "test-steam-key",
  MAL_CLIENT_ID: "test-mal-client-id",
  MAL_CLIENT_SECRET: "test-mal-client-secret",
})

const { resetEnvCache } = await import("@/lib/env")
resetEnvCache()
const { ensureDataDirectories } = await import("@/lib/data-dir")
ensureDataDirectories()
const { db, sqlite } = await import("@/lib/db/client")
const { migrate } = await import("drizzle-orm/better-sqlite3/migrator")

const resetSql = `
PRAGMA foreign_keys = OFF;
DELETE FROM node_attributes;
DELETE FROM node_links;
DELETE FROM images;
DELETE FROM storage_locations;
DELETE FROM external_refs;
DELETE FROM detail_sync_items;
DELETE FROM detail_sync_jobs;
DELETE FROM nodes;
DELETE FROM sync_runs;
DELETE FROM sync_leases;
DELETE FROM sync_accounts;
DELETE FROM auth_rate_limits;
DELETE FROM account;
DELETE FROM session;
DELETE FROM verification;
DELETE FROM user;
DELETE FROM app_settings;
PRAGMA foreign_keys = ON;
`

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" })
})

beforeEach(() => {
  sqlite.exec(resetSql)
  const mediaRoot = path.join(process.env.DATA_DIR!, "media")
  if (fs.existsSync(mediaRoot)) {
    fs.rmSync(mediaRoot, { recursive: true, force: true })
  }
  ensureDataDirectories()
})

afterAll(() => {
  sqlite.close()
  if (process.env.DATA_DIR && fs.existsSync(process.env.DATA_DIR)) {
    fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  }
})
