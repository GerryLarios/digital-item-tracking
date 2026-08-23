import "@/lib/server-only"

import { eq } from "drizzle-orm"
import { XMLParser } from "fast-xml-parser"

import type { NodeStatus } from "@/lib/constants"
import { db } from "@/lib/db/client"
import { appSettings } from "@/lib/db/schema"
import { getSyncAccount, type ParsedSyncAccount } from "@/lib/integrations/service"
import { parseJson } from "@/lib/helpers"
import { fetchMalItemDetails } from "@/lib/providers/mal"
import { reconcileRemoteItem } from "@/lib/sync/service"

export type MalXmlImportResult = {
  created: number
  merged: number
  skipped: number
  failed: number
}

export type MalXmlImportProgress = MalXmlImportResult & {
  processed: number
  total: number
}

export type MalImportFailure = {
  externalId: string
  title: string
  xmlStatus: string | null
  lastUpdatedSeconds: number | null
  error: string
}

// ponytail: fixed delay between API calls; add 429-aware backoff if imports grow
const MAL_IMPORT_THROTTLE_MS = 350

const MAL_IMPORT_FAILURES_KEY = "mal-import-failures"

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function mapMalXmlStatus(rawStatus: unknown): NodeStatus | null {
  const normalized = String(rawStatus ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
  switch (normalized) {
    case "watching":
    case "currentlywatching":
      return "IN_PROGRESS"
    case "completed":
      return "COMPLETED"
    case "onhold":
      return "ON_HOLD"
    case "dropped":
      return "DROPPED"
    case "plantowatch":
      return "NOT_STARTED"
    default:
      return null
  }
}

type MalXmlEntry = Record<string, unknown>

function parseMalEntries(xmlText: string): MalXmlEntry[] {
  let parsed: { myanimelist?: { anime?: MalXmlEntry | MalXmlEntry[] } }
  try {
    parsed = new XMLParser({
      ignoreAttributes: true,
      parseTagValue: false,
      trimValues: true,
    }).parse(xmlText)
  } catch {
    throw new Error("The selected file is not a MyAnimeList export.")
  }
  const anime = parsed?.myanimelist?.anime
  if (!anime) {
    throw new Error("The selected file is not a MyAnimeList export.")
  }
  return Array.isArray(anime) ? anime : [anime]
}

type EntryInput = {
  externalId: string
  title: string
  xmlStatus: string | null
  lastUpdatedSeconds: number | null
}

function toEntryInput(entry: MalXmlEntry): EntryInput | null {
  const externalId = String(entry.series_animedb_id ?? "").trim()
  const title = String(entry.series_title ?? "").trim()
  if (!externalId || !title) return null
  const seconds = Number(entry.my_last_updated)
  return {
    externalId,
    title,
    xmlStatus: String(entry.my_status ?? "").trim() || null,
    lastUpdatedSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
  }
}

function toFailure(input: EntryInput, error: unknown): MalImportFailure {
  return {
    externalId: input.externalId,
    title: input.title,
    xmlStatus: input.xmlStatus,
    lastUpdatedSeconds: input.lastUpdatedSeconds,
    error: (error instanceof Error ? error.message : String(error)).slice(0, 300),
  }
}

async function fetchAndReconcile(
  account: ParsedSyncAccount,
  input: EntryInput,
): Promise<"created" | "merged"> {
  const item = await fetchMalItemDetails(account, input.externalId, ["list"])
  const outcome = await reconcileRemoteItem(
    {
      ...item,
      status: mapMalXmlStatus(input.xmlStatus) ?? item.status,
      remoteUpdatedAt: input.lastUpdatedSeconds
        ? new Date(input.lastUpdatedSeconds * 1000)
        : item.remoteUpdatedAt,
    },
    ["list"],
  )
  return outcome.created ? "created" : "merged"
}

export function getMalImportFailures(): MalImportFailure[] {
  const row = db.query.appSettings
    .findFirst({ where: eq(appSettings.key, MAL_IMPORT_FAILURES_KEY) })
    .sync()
  return row ? parseJson<MalImportFailure[]>(row.value, []) : []
}

function replaceMalImportFailures(failures: MalImportFailure[]) {
  const now = new Date()
  db.insert(appSettings)
    .values({ key: MAL_IMPORT_FAILURES_KEY, value: JSON.stringify(failures), updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: JSON.stringify(failures), updatedAt: now },
    })
    .run()
}

function mergeMalImportFailures(succeededExternalIds: Set<string>, failures: MalImportFailure[]) {
  if (!succeededExternalIds.size && !failures.length) return
  const byId = new Map(getMalImportFailures().map((failure) => [failure.externalId, failure]))
  for (const externalId of succeededExternalIds) {
    byId.delete(externalId)
  }
  for (const failure of failures) {
    byId.set(failure.externalId, failure)
  }
  replaceMalImportFailures([...byId.values()])
}

export async function importMalXml(
  xmlText: string,
  onProgress?: (progress: MalXmlImportProgress) => void,
): Promise<MalXmlImportResult> {
  const entries = parseMalEntries(xmlText)

  const account = getSyncAccount("mal")
  if (!account) {
    throw new Error("Connect MyAnimeList before importing its XML export.")
  }

  const result: MalXmlImportResult = { created: 0, merged: 0, skipped: 0, failed: 0 }
  const succeededExternalIds = new Set<string>()
  const failures: MalImportFailure[] = []
  const report = (processed: number) => {
    if (!onProgress) return
    onProgress({ processed, total: entries.length, ...result })
  }

  for (const [index, entry] of entries.entries()) {
    const input = toEntryInput(entry)
    if (!input) {
      result.skipped += 1
      report(index + 1)
      continue
    }

    try {
      const outcome = await fetchAndReconcile(account, input)
      result[outcome] += 1
      succeededExternalIds.add(input.externalId)
    } catch (error) {
      result.failed += 1
      failures.push(toFailure(input, error))
    }

    report(index + 1)

    if (index < entries.length - 1) {
      await delay(MAL_IMPORT_THROTTLE_MS)
    }
  }

  mergeMalImportFailures(succeededExternalIds, failures)

  return result
}

export async function retryMalImportFailures(
  onProgress?: (progress: MalXmlImportProgress) => void,
): Promise<{ created: number; merged: number; failed: number; total: number }> {
  const account = getSyncAccount("mal")
  if (!account) {
    throw new Error("Connect MyAnimeList before importing its XML export.")
  }

  const pending = getMalImportFailures()
  const result = { created: 0, merged: 0, failed: 0, total: pending.length }
  const stillFailing: MalImportFailure[] = []

  for (const [index, failure] of pending.entries()) {
    try {
      const outcome = await fetchAndReconcile(account, {
        externalId: failure.externalId,
        title: failure.title,
        xmlStatus: failure.xmlStatus,
        lastUpdatedSeconds: failure.lastUpdatedSeconds,
      })
      result[outcome] += 1
    } catch (error) {
      result.failed += 1
      stillFailing.push(toFailure(
        {
          externalId: failure.externalId,
          title: failure.title,
          xmlStatus: failure.xmlStatus,
          lastUpdatedSeconds: failure.lastUpdatedSeconds,
        },
        error,
      ))
    }

    if (onProgress) {
      onProgress({ processed: index + 1, skipped: 0, ...result })
    }

    if (index < pending.length - 1) {
      await delay(MAL_IMPORT_THROTTLE_MS)
    }
  }

  replaceMalImportFailures(stillFailing)

  return result
}
