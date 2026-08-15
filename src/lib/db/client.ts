import "@/lib/server-only"

import Database from "better-sqlite3"
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3"

import { ensureDataDirectories, getDataPaths } from "@/lib/data-dir"
import * as schema from "@/lib/db/schema"

type DatabaseInstance = BetterSQLite3Database<typeof schema>

declare global {
  var __registeredBacklogSqlite: Database.Database | undefined
  var __registeredBacklogDb: DatabaseInstance | undefined
}

function createSqliteConnection() {
  ensureDataDirectories()
  const sqlite = new Database(getDataPaths().database)

  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  sqlite.pragma("synchronous = NORMAL")
  sqlite.pragma("busy_timeout = 5000")

  return sqlite
}

export const sqlite = globalThis.__registeredBacklogSqlite ?? createSqliteConnection()

if (process.env.NODE_ENV !== "production") {
  globalThis.__registeredBacklogSqlite = sqlite
}

export const db: DatabaseInstance =
  globalThis.__registeredBacklogDb ??
  drizzle(sqlite, {
    schema,
  })

if (process.env.NODE_ENV !== "production") {
  globalThis.__registeredBacklogDb = db
}
