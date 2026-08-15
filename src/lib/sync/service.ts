import "@/lib/server-only"

import { and, eq } from "drizzle-orm"

import type { EditableNodeField, Provider, SyncTrigger } from "@/lib/constants"
import { PROVIDER_LABELS } from "@/lib/constants"
import { db } from "@/lib/db/client"
import {
  externalRefs,
  nodeAttributes,
  nodes,
  storageLocations,
  syncRuns,
} from "@/lib/db/schema"
import { createId, parseJson, uniqueValues } from "@/lib/helpers"
import {
  getSyncAccount,
  listSyncAccounts,
  type ParsedSyncAccount,
  upsertSyncAccount,
} from "@/lib/integrations/service"
import { hasLocalOverride } from "@/lib/library/service"
import { syncMalLibrary } from "@/lib/providers/mal"
import { syncSteamLibrary } from "@/lib/providers/steam"
import type { ProviderSyncResult, RemoteCatalogItem } from "@/lib/providers/types"
import { heartbeatSyncLease, releaseSyncLease, acquireSyncLease } from "@/lib/sync/lease"
import { syncManagedMainImage } from "@/lib/storage/images"

function parseMemberships(value: string) {
  return parseJson<string[]>(value, [])
}

function parseSourceData(value: string) {
  return parseJson<Record<string, unknown>>(value, {})
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

function mergeMemberships(
  existing: string[],
  incoming: string[],
  successfulMembershipKinds: string[],
) {
  return uniqueValues([
    ...existing.filter((membership) => !successfulMembershipKinds.includes(membership)),
    ...incoming,
  ])
}

function shouldApplyField<T>(
  existingValue: T | null | undefined,
  incomingValue: T | null | undefined,
  overridden: boolean,
) {
  if (incomingValue == null) return existingValue
  if (overridden) return existingValue
  return incomingValue
}

export async function reconcileRemoteItem(
  item: RemoteCatalogItem,
  successfulMembershipKinds: string[],
) {
  heartbeatSyncLease(item.provider)
  const now = new Date()

  const existingRef = db.query.externalRefs.findFirst({
    where: and(eq(externalRefs.provider, item.provider), eq(externalRefs.externalId, item.externalId)),
  }).sync()

  const existingNode = existingRef
    ? db.query.nodes.findFirst({ where: eq(nodes.id, existingRef.nodeId) }).sync()
    : null
  const overrideFields = parseJson<EditableNodeField[]>(existingNode?.overrideFields ?? "[]", [])
  const nodeId = existingNode?.id ?? createId()
  const isNewNode = !existingNode

  db.transaction((tx) => {
    const mergedMemberships = mergeMemberships(
      existingRef ? parseMemberships(existingRef.listMemberships) : [],
      item.memberships,
      successfulMembershipKinds,
    )

    const nextNodeValues: Partial<typeof nodes.$inferInsert> = {
      displayName: hasLocalOverride(overrideFields, "displayName")
        ? existingNode?.displayName ?? item.title
        : item.title,
      mediaType: existingNode?.mediaType ?? item.mediaType,
      description: shouldApplyField(
        existingNode?.description,
        item.description ?? null,
        hasLocalOverride(overrideFields, "description"),
      ),
      status: shouldApplyField(
        existingNode?.status,
        item.status ?? existingNode?.status ?? "NOT_STARTED",
        hasLocalOverride(overrideFields, "status"),
      ) ?? "NOT_STARTED",
      releaseYear: shouldApplyField(
        existingNode?.releaseYear,
        item.releaseYear ?? null,
        hasLocalOverride(overrideFields, "releaseYear"),
      ),
      nsfw: shouldApplyField(
        existingNode?.nsfw,
        item.nsfw ?? existingNode?.nsfw ?? false,
        hasLocalOverride(overrideFields, "nsfw"),
      ) ?? false,
      hidden: existingNode?.hidden ?? false,
      notes: existingNode?.notes ?? null,
      overrideFields: JSON.stringify(overrideFields),
      updatedAt: now,
    }

    if (existingNode) {
      tx.update(nodes).set(nextNodeValues).where(eq(nodes.id, nodeId)).run()
    } else {
      tx.insert(nodes)
        .values({
          id: nodeId,
          displayName: item.title,
          mediaType: item.mediaType,
          description: nextNodeValues.description ?? null,
          status: (nextNodeValues.status as typeof nodes.$inferInsert["status"]) ?? "NOT_STARTED",
          releaseYear: nextNodeValues.releaseYear ?? null,
          nsfw: nextNodeValues.nsfw ?? false,
          hidden: nextNodeValues.hidden ?? false,
          notes: nextNodeValues.notes ?? null,
          overrideFields: nextNodeValues.overrideFields ?? JSON.stringify([]),
          createdAt: now,
          updatedAt: now,
        })
        .run()
    }

    if (existingRef) {
      tx.update(externalRefs)
        .set({
          nodeId,
          externalUrl: item.externalUrl ?? existingRef.externalUrl,
          mediaType: item.mediaType,
          listMemberships: JSON.stringify(mergedMemberships),
          remoteStatus: item.status ?? existingRef.remoteStatus,
          remoteUpdatedAt: item.remoteUpdatedAt ?? existingRef.remoteUpdatedAt,
          remoteCreatedAt: item.remoteCreatedAt ?? existingRef.remoteCreatedAt,
          lastSeenAt: now,
          isActive: mergedMemberships.length > 0,
          sourceData: JSON.stringify({
            ...parseSourceData(existingRef.sourceData),
            ...(item.sourceData ?? {}),
          }),
          updatedAt: now,
        })
        .where(eq(externalRefs.id, existingRef.id))
        .run()
    } else {
      tx.insert(externalRefs)
        .values({
          id: createId(),
          nodeId,
          provider: item.provider,
          externalId: item.externalId,
          externalUrl: item.externalUrl ?? null,
          mediaType: item.mediaType,
          listMemberships: JSON.stringify(item.memberships),
          remoteStatus: item.status ?? null,
          remoteUpdatedAt: item.remoteUpdatedAt ?? null,
          remoteCreatedAt: item.remoteCreatedAt ?? null,
          lastSeenAt: now,
          isActive: item.memberships.length > 0,
          sourceData: JSON.stringify(item.sourceData ?? {}),
          createdAt: now,
          updatedAt: now,
        })
        .run()
    }

    tx.delete(nodeAttributes)
      .where(and(eq(nodeAttributes.nodeId, nodeId), eq(nodeAttributes.sourceProvider, item.provider)))
      .run()

    if (item.attributes?.length) {
      tx.insert(nodeAttributes)
        .values(
          item.attributes.map((attribute) => ({
            id: createId(),
            nodeId,
            key: attribute.key,
            value: attribute.value,
            valueType: attribute.valueType ?? "text",
            source: item.provider,
            sourceProvider: item.provider,
            lastSeenAt: now,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .run()
    }

    if (item.storageLocations !== undefined) {
      tx.delete(storageLocations)
        .where(and(eq(storageLocations.nodeId, nodeId), eq(storageLocations.sourceProvider, item.provider)))
        .run()

      if (item.storageLocations.length) {
        tx.insert(storageLocations)
          .values(
            item.storageLocations.map((location) => ({
              id: createId(),
              nodeId,
              label: location.label,
              medium: location.medium,
              platform: location.platform ?? null,
              notes: location.notes ?? null,
              source: item.provider,
              sourceProvider: item.provider,
              isActive: true,
              lastSeenAt: now,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .run()
      }
    }
  })

  if (item.imageUrl && !hasLocalOverride(overrideFields, "image")) {
    await syncManagedMainImage(nodeId, item.provider, item.imageUrl)
  }

  return { nodeId, created: isNewNode }
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

export async function syncProvider(provider: Provider, trigger: SyncTrigger = "manual") {
  const account = getSyncAccount(provider)
  if (!account) {
    throw new Error(`${PROVIDER_LABELS[provider]} is not configured.`)
  }

  if (!acquireSyncLease(provider)) {
    throw new Error(`${PROVIDER_LABELS[provider]} sync is already running.`)
  }

  const runId = createRun(provider, trigger)
  const stats = {
    importedItems: 0,
    createdNodes: 0,
    updatedNodes: 0,
    failedItems: 0,
  }
  const warnings: string[] = []
  const successfulMembershipKinds: string[] = []

  try {
    const result = await fetchProviderItems(account)
    warnings.push(...result.warnings)
    successfulMembershipKinds.push(...Object.keys(result.membershipSnapshots))

    for (const item of result.items) {
      try {
        const outcome = await reconcileRemoteItem(item, successfulMembershipKinds)
        stats.importedItems += 1
        if (outcome.created) {
          stats.createdNodes += 1
        } else {
          stats.updatedNodes += 1
        }
      } catch (error) {
        stats.failedItems += 1
        warnings.push(
          `${item.title}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    reconcileMissingMemberships(provider, result.membershipSnapshots)

    const now = new Date()
    upsertSyncAccount(provider, {
      displayName: result.displayName ?? account.displayName,
      externalAccountId: result.externalAccountId ?? account.externalAccountId,
      profile: result.profile ?? account.profile,
      lastSyncedAt: now,
      lastSuccessfulSyncAt: stats.failedItems > 0 ? account.lastSuccessfulSyncAt : now,
    })

    updateRun(runId, {
      status: stats.failedItems > 0 || warnings.length > 0 ? "partial" : "success",
      finishedAt: now,
      stats,
      metadata: { warnings },
    })

    return {
      runId,
      status: stats.failedItems > 0 || warnings.length > 0 ? "partial" : "success",
      stats,
      warnings,
    }
  } catch (error) {
    const now = new Date()
    updateRun(runId, {
      status: "failed",
      finishedAt: now,
      errorText: error instanceof Error ? error.message : String(error),
      stats,
      metadata: { warnings },
    })

    upsertSyncAccount(provider, {
      lastSyncedAt: now,
    })

    throw error
  } finally {
    releaseSyncLease(provider)
  }
}

export async function syncAllProviders(trigger: SyncTrigger = "manual") {
  const enabledAccounts = listSyncAccounts().filter((account) => account.enabled)
  const results = []

  for (const account of enabledAccounts) {
    try {
      results.push(await syncProvider(account.provider, trigger))
    } catch (error) {
      results.push({
        provider: account.provider,
        status: "failed" as const,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}

export function listSyncRuns(limit = 20) {
  return db.query.syncRuns.findMany({
    limit,
    orderBy: (table, operators) => [operators.desc(table.startedAt)],
  }).sync().map((run) => ({
    ...run,
    stats: parseJson<Record<string, unknown>>(run.statsJson, {}),
    metadata: parseJson<Record<string, unknown>>(run.metadataJson, {}),
  }))
}
