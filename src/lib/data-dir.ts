import "@/lib/server-only"

import fs from "node:fs"
import path from "node:path"

import { getEnv } from "@/lib/env"

export function getDataPaths() {
  const { dataDir } = getEnv()

  return {
    root: dataDir,
    database: path.join(dataDir, "app.db"),
    mediaRoot: path.join(dataDir, "media"),
    originals: path.join(dataDir, "media", "originals"),
    thumbnails: path.join(dataDir, "media", "thumbnails"),
    backups: path.join(dataDir, "backups"),
  }
}

export function ensureDataDirectories() {
  const paths = getDataPaths()

  for (const value of Object.values(paths)) {
    const dir = path.extname(value) ? path.dirname(value) : value
    fs.mkdirSync(dir, { recursive: true })
  }

  return paths
}

export function resolveManagedPath(relativePath: string) {
  return path.join(getDataPaths().root, relativePath)
}

export function toManagedRelativePath(absolutePath: string) {
  return path.relative(getDataPaths().root, absolutePath)
}
