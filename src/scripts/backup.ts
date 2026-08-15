import fs from "node:fs"
import path from "node:path"

import { ensureDataDirectories } from "../lib/data-dir"
import { sqlite } from "../lib/db/client"

async function main() {
  const dataPaths = ensureDataDirectories()
  const destination = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.join(
        dataPaths.backups,
        `backup-${new Date().toISOString().replaceAll(":", "-")}`,
      )

  fs.mkdirSync(destination, { recursive: true })

  await sqlite.backup(path.join(destination, "app.db"))
  fs.cpSync(dataPaths.mediaRoot, path.join(destination, "media"), {
    force: true,
    recursive: true,
  })

  console.log(`Backup written to ${destination}`)
}

void main()
