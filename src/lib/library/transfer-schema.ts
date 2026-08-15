import { z } from "zod"

import {
  ATTRIBUTE_VALUE_TYPES,
  EDITABLE_NODE_FIELDS,
  ENTRY_SOURCES,
  IMAGE_ROLES,
  MEDIA_TYPES,
  NODE_STATUSES,
  PROVIDERS,
  STORAGE_MEDIA,
} from "@/lib/constants"

export const LIBRARY_ARCHIVE_FORMAT = "registered-backlog-items"
export const LIBRARY_ARCHIVE_VERSION = 1

const isoDate = z.string().datetime({ offset: true })
const nullableIsoDate = isoDate.nullable()
const nullableProvider = z.enum(PROVIDERS).nullable()

const attributeSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  valueType: z.enum(ATTRIBUTE_VALUE_TYPES),
  source: z.enum(ENTRY_SOURCES),
  sourceProvider: nullableProvider,
  lastSeenAt: nullableIsoDate,
  createdAt: isoDate,
  updatedAt: isoDate,
})

const storageLocationSchema = z.object({
  label: z.string().min(1),
  medium: z.enum(STORAGE_MEDIA),
  platform: z.string().nullable(),
  notes: z.string().nullable(),
  source: z.enum(ENTRY_SOURCES),
  sourceProvider: nullableProvider,
  isActive: z.boolean(),
  lastSeenAt: nullableIsoDate,
  createdAt: isoDate,
  updatedAt: isoDate,
})

const externalRefSchema = z.object({
  provider: z.enum(PROVIDERS),
  externalId: z.string().min(1),
  externalUrl: z.string().nullable(),
  mediaType: z.enum(MEDIA_TYPES).nullable(),
  listMemberships: z.array(z.string()),
  remoteStatus: z.string().nullable(),
  remoteUpdatedAt: nullableIsoDate,
  remoteCreatedAt: nullableIsoDate,
  lastSeenAt: nullableIsoDate,
  isActive: z.boolean(),
  sourceData: z.record(z.string(), z.unknown()),
  createdAt: isoDate,
  updatedAt: isoDate,
})

const linkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
  createdAt: isoDate,
  updatedAt: isoDate,
})

const imageMetadataSchema = z.object({
  role: z.enum(IMAGE_ROLES),
  mimeType: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  byteSize: z.number().int().nonnegative(),
  checksum: z.string().min(1),
  sourceUrl: z.string().nullable(),
  sourceProvider: nullableProvider,
  sortOrder: z.number().int(),
  managed: z.boolean(),
})

export const libraryArchiveItemSchema = z.object({
  id: z.string().min(1),
  mediaType: z.enum(MEDIA_TYPES),
  displayName: z.string().min(1),
  description: z.string().nullable(),
  status: z.enum(NODE_STATUSES),
  releaseYear: z.number().int().nullable(),
  nsfw: z.boolean(),
  hidden: z.boolean(),
  notes: z.string().nullable(),
  overrideFields: z.array(z.enum(EDITABLE_NODE_FIELDS)),
  createdAt: isoDate,
  updatedAt: isoDate,
  attributes: z.array(attributeSchema),
  storageLocations: z.array(storageLocationSchema),
  externalRefs: z.array(externalRefSchema),
  links: z.array(linkSchema),
  images: z.array(imageMetadataSchema),
})

export const libraryArchiveSchema = z.object({
  format: z.literal(LIBRARY_ARCHIVE_FORMAT),
  version: z.literal(LIBRARY_ARCHIVE_VERSION),
  exportedAt: isoDate,
  itemCount: z.number().int().nonnegative(),
  items: z.array(libraryArchiveItemSchema),
}).superRefine((archive, context) => {
  if (archive.itemCount !== archive.items.length) {
    context.addIssue({
      code: "custom",
      message: "itemCount does not match the number of items.",
      path: ["itemCount"],
    })
  }

  const nodeIds = new Set<string>()
  const providerIds = new Set<string>()

  for (const [itemIndex, item] of archive.items.entries()) {
    if (nodeIds.has(item.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate node ID: ${item.id}`,
        path: ["items", itemIndex, "id"],
      })
    }
    nodeIds.add(item.id)

    for (const [refIndex, ref] of item.externalRefs.entries()) {
      const providerId = `${ref.provider}\0${ref.externalId}`
      if (providerIds.has(providerId)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate provider identity: ${ref.provider}/${ref.externalId}`,
          path: ["items", itemIndex, "externalRefs", refIndex],
        })
      }
      providerIds.add(providerId)
    }
  }
})

export type LibraryArchive = z.infer<typeof libraryArchiveSchema>
export type LibraryArchiveItem = z.infer<typeof libraryArchiveItemSchema>
