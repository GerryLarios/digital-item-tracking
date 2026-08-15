import { migrate } from "drizzle-orm/better-sqlite3/migrator"

import { db } from "../lib/db/client"
import { ensureDataDirectories } from "../lib/data-dir"

ensureDataDirectories()
migrate(db, { migrationsFolder: "drizzle" })

console.log("Database migrations applied.")
