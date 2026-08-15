import fs from "node:fs"

import { getDataPaths } from "../lib/data-dir"

async function main() {
  const database = getDataPaths().database

  for (const file of [database, `${database}-wal`, `${database}-shm`]) {
    fs.rmSync(file, { force: true })
  }

  const { db } = await import("../lib/db/client")
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator")

  migrate(db, { migrationsFolder: "drizzle" })
  console.log(`Fresh database created at ${database}. Media files were preserved.`)
}

void main()
