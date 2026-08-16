import "@/lib/server-only"

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import {
  DEFAULT_LIBRARY_SORT,
  DEFAULT_PAGE_SIZE,
  EDITABLE_NODE_FIELDS,
  type CollectionMembership,
  type EditableNodeField,
  type Provider,
} from "@/lib/constants"
import { createId, parseJson, uniqueValues } from "@/lib/helpers"
import { db } from "@/lib/db/client"
import {
  externalRefs,
  libraryNodeSummary,
  nodeAttributes,
  nodeLinks,
  nodes,
  storageLocations,
} from "@/lib/db/schema"
import { deleteAllNodeImages, removePrimaryImageSet, setManualMainImage } from "@/lib/storage/images"
import type { NodeEditorInput, NodeFormInput } from "@/lib/validation"

export type LibraryFilters = {
  q?: string
  mediaType?: string
  status?: string
  provider?: Provider
  collection?: CollectionMembership
  medium?: string
  showHidden?: boolean
  showNsfw?: boolean
  onlyNsfw?: boolean
  sort?: string
  page?: number
  pageSize?: number
}

function normalizeOverrides(value: string) {
  return parseJson<EditableNodeField[]>(value, []).filter((field) =>
    EDITABLE_NODE_FIELDS.includes(field),
  )
}

function buildNodeWhere(filters: LibraryFilters) {
  const conditions = []

  if (filters.q) {
    const likeValue = `%${filters.q}%`
    conditions.push(
      sql`(${libraryNodeSummary.displayName} like ${likeValue} or coalesce(${libraryNodeSummary.description}, '') like ${likeValue})`,
    )
  }

  if (filters.mediaType) {
    conditions.push(eq(libraryNodeSummary.mediaType, filters.mediaType as never))
  }

  if (filters.status) {
    conditions.push(eq(libraryNodeSummary.status, filters.status as never))
  }

  if (!filters.showHidden) {
    conditions.push(eq(libraryNodeSummary.hidden, false))
  }

  if (!filters.showNsfw && !filters.onlyNsfw) {
    conditions.push(eq(libraryNodeSummary.nsfw, false))
  }

  if (filters.onlyNsfw) {
    conditions.push(eq(libraryNodeSummary.nsfw, true))
  }

  if (filters.provider) {
    conditions.push(
      sql`exists (
        select 1
        from external_refs as provider_ref
        where provider_ref.node_id = ${libraryNodeSummary.id}
          and provider_ref.provider = ${filters.provider}
          and provider_ref.is_active = 1
      )`,
    )
  }

  if (filters.collection) {
    conditions.push(
      sql`exists (
        select 1
        from external_refs as collection_ref,
          json_each(collection_ref.list_memberships) as membership
        where collection_ref.node_id = ${libraryNodeSummary.id}
          and collection_ref.is_active = 1
          and membership.value = ${filters.collection}
      )`,
    )
  }

  if (filters.medium) {
    conditions.push(
      sql`exists (
        select 1
        from storage_locations as medium_location
        where medium_location.node_id = ${libraryNodeSummary.id}
          and medium_location.medium = ${filters.medium}
          and medium_location.is_active = 1
      )`,
    )
  }

  if (!conditions.length) return undefined
  return and(...conditions)
}

function mapNodeSummary(node: {
  id: string
  displayName: string
  mediaType: string
  status: string
  description: string | null
  releaseYear: number | null
  hidden: boolean
  nsfw: boolean
  isWishlisted: boolean
  updatedAt: Date
  providersJson: string | null
  mediumsJson: string | null
  mainImageId: string | null
  thumbnailImageId: string | null
}) {
  return {
    id: node.id,
    displayName: node.displayName,
    mediaType: node.mediaType,
    status: node.status,
    description: node.description,
    releaseYear: node.releaseYear,
    hidden: node.hidden,
    nsfw: node.nsfw,
    isWishlisted: node.isWishlisted,
    updatedAt: node.updatedAt,
    providers: parseJson<Provider[]>(node.providersJson, []),
    mediums: parseJson<string[]>(node.mediumsJson, []),
    mainImageId: node.mainImageId,
    thumbnailImageId: node.thumbnailImageId,
  }
}

const SORT_COLUMNS = {
  updated: libraryNodeSummary.updatedAt,
  added: libraryNodeSummary.createdAt,
  title: libraryNodeSummary.displayName,
  release_year: libraryNodeSummary.releaseYear,
  status: libraryNodeSummary.status,
  medium: libraryNodeSummary.mediumsJson,
  wishlist: libraryNodeSummary.isWishlisted,
  rating: libraryNodeSummary.rating,
} as const

function sortOrder(sort: string | undefined) {
  const value = sort ?? DEFAULT_LIBRARY_SORT
  const separator = value.lastIndexOf("_")
  const field = value.slice(0, separator)
  const direction = value.slice(separator + 1)
  const column = SORT_COLUMNS[field as keyof typeof SORT_COLUMNS]
  if (!column) return [desc(libraryNodeSummary.updatedAt)]
  return [direction === "asc" ? asc(column) : desc(column), asc(libraryNodeSummary.id)]
}

export function listNodes(filters: LibraryFilters) {
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE
  const page = Math.max(filters.page ?? 1, 1)
  const where = buildNodeWhere(filters)

  const total =
    db
      .select({ count: sql<number>`count(*)` })
      .from(libraryNodeSummary)
      .where(where)
      .get()?.count ?? 0

  const records = db
    .select()
    .from(libraryNodeSummary)
    .where(where)
    .orderBy(...sortOrder(filters.sort))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()

  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
    items: records.map((record) => mapNodeSummary(record)),
  }
}

export function getNodeById(nodeId: string) {
  const node = db.query.nodes.findFirst({
    where: eq(nodes.id, nodeId),
    with: {
      attributes: {
        orderBy: (table, operators) => [operators.asc(table.key), operators.asc(table.value)],
      },
      storageLocations: {
        orderBy: (table, operators) => [operators.asc(table.label)],
      },
      externalRefs: {
        orderBy: (table, operators) => [operators.asc(table.provider)],
      },
      links: {
        orderBy: (table, operators) => [operators.asc(table.label)],
      },
      images: {
        orderBy: (table, operators) => [operators.asc(table.sortOrder), operators.asc(table.id)],
      },
    },
  }).sync()

  if (!node) {
    return null
  }

  return {
    ...node,
    overrideFields: normalizeOverrides(node.overrideFields),
    memberships: uniqueValues(
      node.externalRefs.flatMap((ref) => parseJson<string[]>(ref.listMemberships, [])),
    ),
  }
}

export function getNodeForEditing(nodeId: string) {
  const node = getNodeById(nodeId)
  if (!node) return null

  return {
    id: node.id,
    displayName: node.displayName,
    mediaType: node.mediaType,
    status: node.status,
    description: node.description ?? "",
    releaseYear: node.releaseYear ? String(node.releaseYear) : "",
    nsfw: node.nsfw,
    hidden: node.hidden,
    notes: node.notes ?? "",
    removeImage: false,
    attributes: node.attributes
      .filter((attribute) => attribute.source === "manual")
      .map((attribute) => ({
        key: attribute.key,
        value: attribute.value,
        valueType: attribute.valueType,
      })),
    storageLocations: node.storageLocations
      .filter((location) => location.source === "manual")
      .map((location) => ({
        label: location.label,
        medium: location.medium,
        platform: location.platform ?? "",
        notes: location.notes ?? "",
      })),
    links: node.links.map((link) => ({
      label: link.label,
      url: link.url,
    })),
  } satisfies NodeEditorInput
}

export async function saveManualNode(input: NodeFormInput, file: File | null) {
  const now = new Date()
  const existing = input.id ? getNodeById(input.id) : null
  const nodeId = existing?.id ?? createId()
  const nextOverrides = new Set<EditableNodeField>(existing?.overrideFields ?? [])

  for (const field of EDITABLE_NODE_FIELDS) {
    if (field !== "image") {
      nextOverrides.add(field)
    }
  }

  if (file && file.size > 0) {
    nextOverrides.add("image")
  }

  if (input.removeImage) {
    nextOverrides.add("image")
  }

  db.transaction((tx) => {
    if (existing) {
      tx
        .update(nodes)
        .set({
          displayName: input.displayName,
          mediaType: input.mediaType,
          description: input.description ?? null,
          status: input.status,
          releaseYear: input.releaseYear ?? null,
          nsfw: input.nsfw,
          hidden: input.hidden,
          notes: input.notes ?? null,
          overrideFields: JSON.stringify([...nextOverrides]),
          updatedAt: now,
        })
        .where(eq(nodes.id, nodeId))
        .run()
    } else {
      tx.insert(nodes).values({
        id: nodeId,
        displayName: input.displayName,
        mediaType: input.mediaType,
        description: input.description ?? null,
        status: input.status,
        releaseYear: input.releaseYear ?? null,
        nsfw: input.nsfw,
        hidden: input.hidden,
        notes: input.notes ?? null,
        overrideFields: JSON.stringify([...nextOverrides]),
        createdAt: now,
        updatedAt: now,
      }).run()
    }

    tx.delete(nodeAttributes).where(and(eq(nodeAttributes.nodeId, nodeId), eq(nodeAttributes.source, "manual"))).run()
    tx.delete(storageLocations).where(and(eq(storageLocations.nodeId, nodeId), eq(storageLocations.source, "manual"))).run()
    tx.delete(nodeLinks).where(eq(nodeLinks.nodeId, nodeId)).run()

    if (input.attributes.length) {
      const attributeValues: typeof nodeAttributes.$inferInsert[] = input.attributes.map((attribute) => ({
        id: createId(),
        nodeId,
        key: attribute.key,
        value: attribute.value,
        valueType: attribute.valueType,
        source: "manual",
        createdAt: now,
        updatedAt: now,
      }))
      tx.insert(nodeAttributes).values(
        attributeValues,
      ).run()
    }

    if (input.storageLocations.length) {
      const locationValues: typeof storageLocations.$inferInsert[] = input.storageLocations.map((location) => ({
        id: createId(),
        nodeId,
        label: location.label,
        medium: location.medium,
        platform: location.platform ?? null,
        notes: location.notes ?? null,
        source: "manual",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }))
      tx.insert(storageLocations).values(
        locationValues,
      ).run()
    }

    if (input.links.length) {
      tx.insert(nodeLinks).values(
        input.links.map((link) => ({
          id: createId(),
          nodeId,
          label: link.label,
          url: link.url,
          createdAt: now,
          updatedAt: now,
        })),
      ).run()
    }
  })

  if (input.removeImage) {
    await removePrimaryImageSet(nodeId)
  }

  if (file && file.size > 0) {
    await setManualMainImage(nodeId, file)
  }

  return nodeId
}

export function deleteNode(nodeId: string) {
  deleteAllNodeImages(nodeId)
  db.delete(nodes).where(eq(nodes.id, nodeId)).run()
}

export function parseOverrideFields(rawOverrideFields: string | string[]) {
  return Array.isArray(rawOverrideFields)
    ? rawOverrideFields
    : normalizeOverrides(rawOverrideFields)
}

export function hasLocalOverride(rawOverrideFields: string | string[], field: EditableNodeField) {
  return parseOverrideFields(rawOverrideFields).includes(field)
}

export function touchNodeUpdatedAt(nodeId: string) {
  db.update(nodes).set({ updatedAt: new Date() }).where(eq(nodes.id, nodeId)).run()
}

export function attachManualExternalRefs(
  nodeId: string,
  refs: Array<{ provider: Provider; externalId: string; externalUrl?: string }>,
) {
  const now = new Date()

  const existing = db.query.externalRefs.findMany({
    where: and(eq(externalRefs.nodeId, nodeId), inArray(externalRefs.provider, refs.map((ref) => ref.provider))),
  }).sync()

  if (existing.length) {
    db.delete(externalRefs).where(inArray(externalRefs.id, existing.map((ref) => ref.id))).run()
  }

  if (!refs.length) return

  db.insert(externalRefs).values(
    refs.map((ref) => ({
      id: createId(),
      nodeId,
      provider: ref.provider,
      externalId: ref.externalId,
      externalUrl: ref.externalUrl ?? null,
      mediaType: null,
      listMemberships: JSON.stringify(["manual"]),
      isActive: true,
      sourceData: JSON.stringify({ manual: true }),
      createdAt: now,
      updatedAt: now,
    })),
  ).run()
}
