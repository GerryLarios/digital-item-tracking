import "@/lib/server-only"

import { and, asc, eq, ne } from "drizzle-orm"

import type { EditableNodeField } from "@/lib/constants"
import { db } from "@/lib/db/client"
import {
  externalRefs,
  nodeAttributes,
  nodes,
  storageLocations,
  syncRunItems,
  syncRuns,
} from "@/lib/db/schema"
import { createId, parseJson, uniqueValues } from "@/lib/helpers"
import { hasLocalOverride } from "@/lib/library/service"
import type { RemoteAttribute, RemoteCatalogItem } from "@/lib/providers/types"
import { heartbeatSyncLease } from "@/lib/sync/lease"
import { syncManagedMainImage } from "@/lib/storage/images"

function parseMemberships(value: string) {
  return parseJson<string[]>(value, [])
}

function parseSourceData(value: string) {
  return parseJson<Record<string, unknown>>(value, {})
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
      const uniqueAttributes: RemoteAttribute[] = []
      const seen = new Set<string>()
      const duplicates: string[] = []
      for (const attribute of item.attributes) {
        const identity = `${attribute.key}\u0000${attribute.value}`
        if (seen.has(identity)) {
          duplicates.push(`${attribute.key}: ${attribute.value}`)
          continue
        }
        seen.add(identity)
        uniqueAttributes.push(attribute)
      }
      if (duplicates.length) {
        console.warn("Skipping duplicate node attributes", {
          provider: item.provider,
          externalId: item.externalId,
          dropped: duplicates.length,
          duplicates,
        })
      }
      tx.insert(nodeAttributes)
        .values(
          uniqueAttributes.map((attribute) => ({
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

export function listRunFailedItems(runId: string) {
  return db.select({
    itemId: syncRunItems.id,
    nodeId: syncRunItems.nodeId,
    title: syncRunItems.title,
    message: syncRunItems.errorText,
  })
    .from(syncRunItems)
    .where(and(eq(syncRunItems.runId, runId), eq(syncRunItems.status, "failed")))
    .orderBy(asc(syncRunItems.finishedAt))
    .all()
}

export function clearCompletedSyncRuns() {
  db.delete(syncRuns).where(ne(syncRuns.status, "running")).run()
}
