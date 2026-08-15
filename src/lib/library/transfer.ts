import "@/lib/server-only"

import { asc, eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import {
  externalRefs,
  nodeAttributes,
  nodeLinks,
  nodes,
  storageLocations,
} from "@/lib/db/schema"
import { createId, parseJson, uniqueValues } from "@/lib/helpers"
import {
  LIBRARY_ARCHIVE_FORMAT,
  LIBRARY_ARCHIVE_VERSION,
  type LibraryArchive,
  type LibraryArchiveItem,
  libraryArchiveSchema,
} from "@/lib/library/transfer-schema"

function toIso(value: Date | null) {
  return value?.toISOString() ?? null
}

function providerIdentity(provider: string, externalId: string) {
  return `${provider}\0${externalId}`
}

export function exportLibrary(): LibraryArchive {
  const records = db.query.nodes.findMany({
    with: {
      attributes: {
        orderBy: (table, operators) => [
          operators.asc(table.key),
          operators.asc(table.valueType),
          operators.asc(table.value),
        ],
      },
      storageLocations: {
        orderBy: (table, operators) => [
          operators.asc(table.label),
          operators.asc(table.medium),
          operators.asc(table.platform),
        ],
      },
      externalRefs: {
        orderBy: (table, operators) => [
          operators.asc(table.provider),
          operators.asc(table.externalId),
        ],
      },
      links: {
        orderBy: (table, operators) => [operators.asc(table.url)],
      },
      images: {
        orderBy: (table, operators) => [
          operators.asc(table.sortOrder),
          operators.asc(table.role),
        ],
      },
    },
    orderBy: [asc(nodes.id)],
  }).sync()

  return libraryArchiveSchema.parse({
    format: LIBRARY_ARCHIVE_FORMAT,
    version: LIBRARY_ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    itemCount: records.length,
    items: records.map((node) => ({
      id: node.id,
      mediaType: node.mediaType,
      displayName: node.displayName,
      description: node.description,
      status: node.status,
      releaseYear: node.releaseYear,
      nsfw: node.nsfw,
      hidden: node.hidden,
      notes: node.notes,
      overrideFields: parseJson(node.overrideFields, []),
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString(),
      attributes: node.attributes.map((attribute) => ({
        key: attribute.key,
        value: attribute.value,
        valueType: attribute.valueType,
        source: attribute.source,
        sourceProvider: attribute.sourceProvider,
        lastSeenAt: toIso(attribute.lastSeenAt),
        createdAt: attribute.createdAt.toISOString(),
        updatedAt: attribute.updatedAt.toISOString(),
      })),
      storageLocations: node.storageLocations.map((location) => ({
        label: location.label,
        medium: location.medium,
        platform: location.platform,
        notes: location.notes,
        source: location.source,
        sourceProvider: location.sourceProvider,
        isActive: location.isActive,
        lastSeenAt: toIso(location.lastSeenAt),
        createdAt: location.createdAt.toISOString(),
        updatedAt: location.updatedAt.toISOString(),
      })),
      externalRefs: node.externalRefs.map((ref) => ({
        provider: ref.provider,
        externalId: ref.externalId,
        externalUrl: ref.externalUrl,
        mediaType: ref.mediaType,
        listMemberships: parseJson(ref.listMemberships, []),
        remoteStatus: ref.remoteStatus,
        remoteUpdatedAt: toIso(ref.remoteUpdatedAt),
        remoteCreatedAt: toIso(ref.remoteCreatedAt),
        lastSeenAt: toIso(ref.lastSeenAt),
        isActive: ref.isActive,
        sourceData: parseJson(ref.sourceData, {}),
        createdAt: ref.createdAt.toISOString(),
        updatedAt: ref.updatedAt.toISOString(),
      })),
      links: node.links.map((link) => ({
        label: link.label,
        url: link.url,
        createdAt: link.createdAt.toISOString(),
        updatedAt: link.updatedAt.toISOString(),
      })),
      images: node.images.map((image) => ({
        role: image.role,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        byteSize: image.byteSize,
        checksum: image.checksum,
        sourceUrl: image.sourceUrl,
        sourceProvider: image.sourceProvider,
        sortOrder: image.sortOrder,
        managed: image.managed,
      })),
    })),
  })
}

function toDate(value: string | null) {
  return value ? new Date(value) : null
}

function nodeValues(item: LibraryArchiveItem) {
  return {
    mediaType: item.mediaType,
    displayName: item.displayName,
    description: item.description,
    status: item.status,
    releaseYear: item.releaseYear,
    nsfw: item.nsfw,
    hidden: item.hidden,
    notes: item.notes,
    overrideFields: JSON.stringify(item.overrideFields),
    updatedAt: new Date(item.updatedAt),
  }
}

export function importLibrary(input: unknown) {
  const archive = libraryArchiveSchema.parse(input)
  const existingNodes = db.select({ id: nodes.id }).from(nodes).all()
  const existingRefs = db.select({
    nodeId: externalRefs.nodeId,
    provider: externalRefs.provider,
    externalId: externalRefs.externalId,
  }).from(externalRefs).all()
  const nodeIds = new Set(existingNodes.map((node) => node.id))
  const providerNodes = new Map(
    existingRefs.map((ref) => [
      providerIdentity(ref.provider, ref.externalId),
      ref.nodeId,
    ]),
  )

  const resolutions = archive.items.map((item) => {
    const matches = new Set<string>()
    if (nodeIds.has(item.id)) matches.add(item.id)
    for (const ref of item.externalRefs) {
      const nodeId = providerNodes.get(providerIdentity(ref.provider, ref.externalId))
      if (nodeId) matches.add(nodeId)
    }
    if (matches.size > 1) {
      throw new Error(`Imported identities for "${item.displayName}" resolve to different items.`)
    }
    return { item, nodeId: matches.values().next().value as string | undefined }
  })

  let created = 0
  let merged = 0

  db.transaction((tx) => {
    for (const resolution of resolutions) {
      const { item } = resolution
      const nodeId = resolution.nodeId ?? item.id

      if (resolution.nodeId) {
        tx.update(nodes).set(nodeValues(item)).where(eq(nodes.id, nodeId)).run()
        merged += 1
      } else {
        tx.insert(nodes)
          .values({
            id: nodeId,
            ...nodeValues(item),
            createdAt: new Date(item.createdAt),
          })
          .run()
        created += 1
      }

      const currentAttributes = tx.select({
        key: nodeAttributes.key,
        value: nodeAttributes.value,
        valueType: nodeAttributes.valueType,
      }).from(nodeAttributes).where(eq(nodeAttributes.nodeId, nodeId)).all()
      const attributeKeys = new Set(
        currentAttributes.map((attribute) =>
          JSON.stringify([attribute.key, attribute.valueType, attribute.value]),
        ),
      )
      const newAttributes = item.attributes.filter((attribute) => {
        const key = JSON.stringify([attribute.key, attribute.valueType, attribute.value])
        if (attributeKeys.has(key)) return false
        attributeKeys.add(key)
        return true
      })
      if (newAttributes.length) {
        tx.insert(nodeAttributes).values(newAttributes.map((attribute) => ({
          id: createId(),
          nodeId,
          key: attribute.key,
          value: attribute.value,
          valueType: attribute.valueType,
          source: attribute.source,
          sourceProvider: attribute.sourceProvider,
          lastSeenAt: toDate(attribute.lastSeenAt),
          createdAt: new Date(attribute.createdAt),
          updatedAt: new Date(attribute.updatedAt),
        }))).run()
      }

      const currentLocations = tx.select({
        label: storageLocations.label,
        medium: storageLocations.medium,
        platform: storageLocations.platform,
      }).from(storageLocations).where(eq(storageLocations.nodeId, nodeId)).all()
      const locationKeys = new Set(
        currentLocations.map((location) =>
          JSON.stringify([location.label, location.medium, location.platform]),
        ),
      )
      const newLocations = item.storageLocations.filter((location) => {
        const key = JSON.stringify([location.label, location.medium, location.platform])
        if (locationKeys.has(key)) return false
        locationKeys.add(key)
        return true
      })
      if (newLocations.length) {
        tx.insert(storageLocations).values(newLocations.map((location) => ({
          id: createId(),
          nodeId,
          label: location.label,
          medium: location.medium,
          platform: location.platform,
          notes: location.notes,
          source: location.source,
          sourceProvider: location.sourceProvider,
          isActive: location.isActive,
          lastSeenAt: toDate(location.lastSeenAt),
          createdAt: new Date(location.createdAt),
          updatedAt: new Date(location.updatedAt),
        }))).run()
      }

      const currentLinks = tx.select().from(nodeLinks)
        .where(eq(nodeLinks.nodeId, nodeId)).all()
      const linksByUrl = new Map(currentLinks.map((link) => [link.url, link]))
      for (const link of item.links) {
        const existing = linksByUrl.get(link.url)
        if (existing) {
          tx.update(nodeLinks)
            .set({ label: link.label, updatedAt: new Date(link.updatedAt) })
            .where(eq(nodeLinks.id, existing.id))
            .run()
        } else {
          const id = createId()
          tx.insert(nodeLinks).values({
            id,
            nodeId,
            label: link.label,
            url: link.url,
            createdAt: new Date(link.createdAt),
            updatedAt: new Date(link.updatedAt),
          }).run()
          linksByUrl.set(link.url, {
            id,
            nodeId,
            label: link.label,
            url: link.url,
            createdAt: new Date(link.createdAt),
            updatedAt: new Date(link.updatedAt),
          })
        }
      }

      const currentRefs = tx.select().from(externalRefs)
        .where(eq(externalRefs.nodeId, nodeId)).all()
      const refsByIdentity = new Map(
        currentRefs.map((ref) => [providerIdentity(ref.provider, ref.externalId), ref]),
      )
      for (const ref of item.externalRefs) {
        const existing = refsByIdentity.get(providerIdentity(ref.provider, ref.externalId))
        if (existing) {
          const currentMemberships = parseJson<string[]>(existing.listMemberships, [])
          const currentSourceData = parseJson<Record<string, unknown>>(existing.sourceData, {})
          tx.update(externalRefs)
            .set({
              externalUrl: ref.externalUrl,
              mediaType: ref.mediaType,
              listMemberships: JSON.stringify(
                uniqueValues([...currentMemberships, ...ref.listMemberships]),
              ),
              remoteStatus: ref.remoteStatus,
              remoteUpdatedAt: toDate(ref.remoteUpdatedAt),
              remoteCreatedAt: toDate(ref.remoteCreatedAt),
              lastSeenAt: toDate(ref.lastSeenAt),
              isActive: ref.isActive,
              sourceData: JSON.stringify({ ...currentSourceData, ...ref.sourceData }),
              updatedAt: new Date(ref.updatedAt),
            })
            .where(eq(externalRefs.id, existing.id))
            .run()
        } else {
          tx.insert(externalRefs).values({
            id: createId(),
            nodeId,
            provider: ref.provider,
            externalId: ref.externalId,
            externalUrl: ref.externalUrl,
            mediaType: ref.mediaType,
            listMemberships: JSON.stringify(ref.listMemberships),
            remoteStatus: ref.remoteStatus,
            remoteUpdatedAt: toDate(ref.remoteUpdatedAt),
            remoteCreatedAt: toDate(ref.remoteCreatedAt),
            lastSeenAt: toDate(ref.lastSeenAt),
            isActive: ref.isActive,
            sourceData: JSON.stringify(ref.sourceData),
            createdAt: new Date(ref.createdAt),
            updatedAt: new Date(ref.updatedAt),
          }).run()
        }
      }
    }
  })

  return {
    created,
    merged,
    artworkSkipped: archive.items.reduce((count, item) => count + item.images.length, 0),
  }
}
