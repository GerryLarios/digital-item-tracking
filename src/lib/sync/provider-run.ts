import "@/lib/server-only"

import { and, asc, count, eq, sql } from "drizzle-orm"

import type { Provider, SyncTrigger } from "@/lib/constants"
import { PROVIDER_LABELS } from "@/lib/constants"
import { db } from "@/lib/db/client"
import { externalRefs, storageLocations, syncLeases, syncRunItems, syncRuns } from "@/lib/db/schema"
import { createId, parseJson } from "@/lib/helpers"
import {
  getSyncAccount,
  listSyncAccounts,
  type ParsedSyncAccount,
  upsertSyncAccount,
} from "@/lib/integrations/service"
import { syncMalLibrary } from "@/lib/providers/mal"
import { syncSteamLibrary } from "@/lib/providers/steam"
import type { ProviderSyncResult, RemoteCatalogItem } from "@/lib/providers/types"
import {
  SYNC_LEASE_TTL_MS,
  SYNC_PROCESS_OWNER,
  acquireSyncLease,
  releaseSyncLease,
} from "@/lib/sync/lease"
import { reconcileRemoteItem } from "@/lib/sync/service"

export type ProviderRunStats = {
  importedItems: number
  createdNodes: number
  updatedNodes: number
  failedItems: number
}

type RunMetadata = {
  warnings?: string[]
  membershipSnapshots?: Record<string, string[]>
  successfulMembershipKinds?: string[]
  profile?: Record<string, unknown>
  displayName?: string | null
  externalAccountId?: string | null
}

function parseMemberships(value: string) {
  return parseJson<string[]>(value, [])
}

function parseMetadata(value: string): RunMetadata {
  return parseJson<RunMetadata>(value, {})
}

function serializeItem(item: RemoteCatalogItem): string {
  return JSON.stringify({
    ...item,
    remoteUpdatedAt: item.remoteUpdatedAt?.getTime() ?? null,
    remoteCreatedAt: item.remoteCreatedAt?.getTime() ?? null,
  })
}

function parseItem(payloadJson: string): RemoteCatalogItem {
  const raw = JSON.parse(payloadJson) as Record<string, unknown>
  return {
    ...(raw as RemoteCatalogItem),
    remoteUpdatedAt: typeof raw.remoteUpdatedAt === "number" ? new Date(raw.remoteUpdatedAt) : null,
    remoteCreatedAt: typeof raw.remoteCreatedAt === "number" ? new Date(raw.remoteCreatedAt) : null,
  }
}

function createRun(provider: Provider, trigger: SyncTrigger) {
  const now = new Date()
  const id = createId()
  db.insert(syncRuns)
    .values({
      id,
      provider,
      trigger,
      status: "running",
      startedAt: now,
      createdAt: now,
      updatedAt: now,
      statsJson: JSON.stringify({ importedItems: 0, createdNodes: 0, updatedNodes: 0, failedItems: 0 }),
      metadataJson: JSON.stringify({ warnings: [] }),
    })
    .run()

  return id
}

function updateRun(
  runId: string,
  values: Partial<typeof syncRuns.$inferInsert> & {
    stats?: Record<string, unknown>
    metadata?: Record<string, unknown>
  },
) {
  db.update(syncRuns)
    .set({
      ...values,
      statsJson: values.stats ? JSON.stringify(values.stats) : undefined,
      metadataJson: values.metadata ? JSON.stringify(values.metadata) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(syncRuns.id, runId))
    .run()
}

async function fetchProviderItems(account: ParsedSyncAccount): Promise<ProviderSyncResult> {
  switch (account.provider) {
    case "steam":
      return syncSteamLibrary(account)
    case "mal":
      return syncMalLibrary(account)
    default:
      throw new Error(`Unsupported provider ${account.provider}`)
  }
}

function snapshotRunItems(runId: string, items: RemoteCatalogItem[]) {
  const now = new Date()
  db.insert(syncRunItems)
    .values(
      items.map((item) => ({
        id: createId(),
        runId,
        externalId: item.externalId,
        title: item.title,
        status: "pending" as const,
        attempts: 0,
        payloadJson: serializeItem(item),
        createdAt: now,
        updatedAt: now,
      })),
    )
    .run()
}

function reconcileMissingMemberships(
  provider: Provider,
  membershipSnapshots: Record<string, string[]>,
) {
  const refs = db.query.externalRefs.findMany({ where: eq(externalRefs.provider, provider) }).sync()
  const fetchedKinds = Object.keys(membershipSnapshots)
  if (!fetchedKinds.length) return

  for (const ref of refs) {
    const existingMemberships = parseMemberships(ref.listMemberships)
    const nextMemberships = existingMemberships.filter((membership) => {
      const snapshot = membershipSnapshots[membership]
      if (!snapshot) return true
      return snapshot.includes(ref.externalId)
    })

    const changed = nextMemberships.length !== existingMemberships.length
    if (!changed) continue

    db.update(externalRefs)
      .set({
        listMemberships: JSON.stringify(nextMemberships),
        isActive: nextMemberships.length > 0,
        updatedAt: new Date(),
      })
      .where(eq(externalRefs.id, ref.id))
      .run()

    if (provider === "steam" && !nextMemberships.includes("owned")) {
      db.delete(storageLocations)
        .where(and(eq(storageLocations.nodeId, ref.nodeId), eq(storageLocations.sourceProvider, provider)))
        .run()
    }
  }
}

export function enqueueProviderSync(provider: Provider, trigger: SyncTrigger = "manual") {
  const account = getSyncAccount(provider)
  if (!account) {
    throw new Error(`${PROVIDER_LABELS[provider]} is not configured.`)
  }

  if (!acquireSyncLease(provider)) {
    throw new Error(`${PROVIDER_LABELS[provider]} sync is already running.`)
  }

  const runId = createRun(provider, trigger)
  return { runId, provider }
}

export function enqueueAllProviderSyncs(trigger: SyncTrigger = "manual") {
  const enabledAccounts = listSyncAccounts().filter((account) => account.enabled)
  const results = []

  for (const account of enabledAccounts) {
    try {
      results.push({ ...enqueueProviderSync(account.provider, trigger) })
    } catch (error) {
      results.push({
        provider: account.provider,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}

export async function processProviderRun(runId: string) {
  const run = db.query.syncRuns.findFirst({ where: eq(syncRuns.id, runId) }).sync()
  if (!run || run.status !== "running") return null

  const account = getSyncAccount(run.provider)
  if (!account) {
    throw new Error(`${PROVIDER_LABELS[run.provider]} is not configured.`)
  }

  const stats: ProviderRunStats = {
    importedItems: 0,
    createdNodes: 0,
    updatedNodes: 0,
    failedItems: 0,
  }
  const warnings: string[] = []
  let successfulMembershipKinds: string[] = []
  let membershipSnapshots: Record<string, string[]> = {}

  const itemCount =
    db.select({ count: count() }).from(syncRunItems).where(eq(syncRunItems.runId, runId)).get()?.count ?? 0

  if (itemCount === 0) {
    let result: ProviderSyncResult
    try {
      result = await fetchProviderItems(account)
    } catch (error) {
      const now = new Date()
      updateRun(runId, {
        status: "failed",
        finishedAt: now,
        errorText: error instanceof Error ? error.message : String(error),
        stats,
        metadata: { warnings },
      })
      upsertSyncAccount(run.provider, { lastSyncedAt: now })
      releaseSyncLease(run.provider)
      throw error
    }

    warnings.push(...result.warnings)
    successfulMembershipKinds = Object.keys(result.membershipSnapshots)
    membershipSnapshots = result.membershipSnapshots
    snapshotRunItems(runId, result.items)
    updateRun(runId, {
      metadata: {
        warnings,
        membershipSnapshots,
        successfulMembershipKinds,
        profile: result.profile,
        displayName: result.displayName,
        externalAccountId: result.externalAccountId,
      },
    })
  } else {
    const metadata = parseMetadata(run.metadataJson)
    successfulMembershipKinds = metadata.successfulMembershipKinds ?? []
    membershipSnapshots = metadata.membershipSnapshots ?? {}
  }

  const items = db.select()
    .from(syncRunItems)
    .where(
      and(
        eq(syncRunItems.runId, runId),
        sql`${syncRunItems.status} in ('pending', 'running')`,
      ),
    )
    .orderBy(asc(syncRunItems.createdAt))
    .all()

  for (const item of items) {
    const startedAt = new Date()
    db.update(syncRunItems)
      .set({
        status: "running",
        attempts: item.attempts + 1,
        errorText: null,
        startedAt,
        finishedAt: null,
        updatedAt: startedAt,
      })
      .where(eq(syncRunItems.id, item.id))
      .run()

    try {
      const outcome = await reconcileRemoteItem(parseItem(item.payloadJson), successfulMembershipKinds)
      stats.importedItems += 1
      if (outcome.created) {
        stats.createdNodes += 1
      } else {
        stats.updatedNodes += 1
      }
      const finishedAt = new Date()
      db.update(syncRunItems)
        .set({ status: "success", nodeId: outcome.nodeId, finishedAt, updatedAt: finishedAt })
        .where(eq(syncRunItems.id, item.id))
        .run()
    } catch (error) {
      stats.failedItems += 1
      warnings.push(`${item.title}: ${error instanceof Error ? error.message : String(error)}`)
      const finishedAt = new Date()
      db.update(syncRunItems)
        .set({
          status: "failed",
          errorText: error instanceof Error ? error.message : String(error),
          finishedAt,
          updatedAt: finishedAt,
        })
        .where(eq(syncRunItems.id, item.id))
        .run()
    }
  }

  reconcileMissingMemberships(run.provider, membershipSnapshots)

  const metadata = parseMetadata(run.metadataJson)
  const now = new Date()
  upsertSyncAccount(run.provider, {
    displayName: metadata.displayName ?? account.displayName,
    externalAccountId: metadata.externalAccountId ?? account.externalAccountId,
    profile: metadata.profile ?? account.profile,
    lastSyncedAt: now,
    lastSuccessfulSyncAt: stats.failedItems > 0 ? account.lastSuccessfulSyncAt : now,
  })

  const previousWarnings = parseMetadata(run.metadataJson).warnings ?? []
  const allWarnings = [...previousWarnings, ...warnings]
  const status = stats.failedItems > 0 || warnings.length > 0 ? "partial" : "success"
  updateRun(runId, {
    status,
    finishedAt: now,
    stats,
    metadata: { ...parseMetadata(run.metadataJson), warnings: allWarnings },
  })
  releaseSyncLease(run.provider)

  return { runId, status, stats, warnings }
}

export async function processNextProviderRun() {
  const run = db.select()
    .from(syncRuns)
    .where(eq(syncRuns.status, "running"))
    .orderBy(asc(syncRuns.startedAt))
    .limit(1)
    .get()
  if (!run) return false

  await processProviderRun(run.id)
  return true
}

export function getProviderSyncProgress() {
  const runs = db.select()
    .from(syncRuns)
    .where(eq(syncRuns.status, "running"))
    .orderBy(asc(syncRuns.startedAt))
    .all()

  return runs.map((run) => {
    const counts = db.select({
      total: count(),
      pending: sql<number>`coalesce(sum(case when ${syncRunItems.status} = 'pending' then 1 else 0 end), 0)`,
      running: sql<number>`coalesce(sum(case when ${syncRunItems.status} = 'running' then 1 else 0 end), 0)`,
      succeeded: sql<number>`coalesce(sum(case when ${syncRunItems.status} = 'success' then 1 else 0 end), 0)`,
      failed: sql<number>`coalesce(sum(case when ${syncRunItems.status} = 'failed' then 1 else 0 end), 0)`,
    })
      .from(syncRunItems)
      .where(eq(syncRunItems.runId, run.id))
      .get()

    const errors = db.select({
      itemId: syncRunItems.id,
      nodeId: syncRunItems.nodeId,
      title: syncRunItems.title,
      message: syncRunItems.errorText,
    })
      .from(syncRunItems)
      .where(and(eq(syncRunItems.runId, run.id), eq(syncRunItems.status, "failed")))
      .orderBy(asc(syncRunItems.finishedAt))
      .limit(5)
      .all()

    return {
      runId: run.id,
      provider: run.provider,
      counts: {
        total: counts?.total ?? 0,
        pending: counts?.pending ?? 0,
        running: counts?.running ?? 0,
        succeeded: counts?.succeeded ?? 0,
        failed: counts?.failed ?? 0,
        processed: (counts?.succeeded ?? 0) + (counts?.failed ?? 0),
      },
      errors,
    }
  })
}

export function retryProviderRunItem(runId: string, itemId: string) {
  const run = db.query.syncRuns.findFirst({ where: eq(syncRuns.id, runId) }).sync()
  if (!run) {
    throw new Error("Sync run not found.")
  }
  if (run.status !== "partial") {
    throw new Error("Only a completed run with failed items can be retried.")
  }

  if (!acquireSyncLease(run.provider)) {
    throw new Error(`${PROVIDER_LABELS[run.provider]} sync is already running.`)
  }

  const item = db.query.syncRunItems.findFirst({
    where: and(eq(syncRunItems.id, itemId), eq(syncRunItems.runId, runId)),
  }).sync()
  if (!item || item.status !== "failed") {
    releaseSyncLease(run.provider)
    throw new Error("The selected item is not a failed sync item.")
  }

  const now = new Date()
  db.transaction((tx) => {
    tx.update(syncRunItems)
      .set({ status: "pending", errorText: null, startedAt: null, finishedAt: null, updatedAt: now })
      .where(eq(syncRunItems.id, itemId))
      .run()
    tx.update(syncRuns)
      .set({ status: "running", finishedAt: null, updatedAt: now })
      .where(eq(syncRuns.id, runId))
      .run()
  })
}

export function recoverInterruptedProviderSync() {
  const runningRuns = db.select().from(syncRuns).where(eq(syncRuns.status, "running")).all()
  if (!runningRuns.length) return false

  const now = new Date()
  db.transaction((tx) => {
    for (const run of runningRuns) {
      tx.update(syncRunItems)
        .set({ status: "pending", startedAt: null, finishedAt: null, updatedAt: now })
        .where(
          and(
            eq(syncRunItems.runId, run.id),
            sql`${syncRunItems.status} in ('running', 'pending')`,
          ),
        )
        .run()
      tx.delete(syncLeases).where(eq(syncLeases.provider, run.provider)).run()
      tx.insert(syncLeases)
        .values({
          provider: run.provider,
          ownerId: SYNC_PROCESS_OWNER,
          expiresAt: new Date(now.getTime() + SYNC_LEASE_TTL_MS),
          heartbeatAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .run()
    }
  })

  return true
}
