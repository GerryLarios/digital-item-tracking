export const MEDIA_TYPES = [
  "ANIME",
  "GAME",
  "MANGA",
  "BOOK",
  "MOVIE",
  "TV",
  "COMIC",
  "VISUAL_NOVEL",
  "TABLETOP",
  "MUSIC",
  "OTHER",
] as const

export const NODE_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "ON_HOLD",
  "DROPPED",
] as const

export const ATTRIBUTE_VALUE_TYPES = ["text", "number", "date", "url", "json"] as const

export const STORAGE_MEDIA = [
  "physical",
  "digital",
  "cloud",
  "subscription",
  "streaming",
  "other",
] as const

export const ENTRY_SOURCES = ["manual", "steam", "mal", "system"] as const

export const PROVIDERS = ["steam", "mal"] as const
export const COLLECTION_MEMBERSHIPS = ["wishlist", "owned", "favorite", "list"] as const

export const IMAGE_ROLES = ["main", "thumbnail", "gallery"] as const

export const SYNC_RUN_STATUSES = ["running", "success", "partial", "failed"] as const

export const SYNC_TRIGGERS = ["manual", "schedule", "system"] as const

export const DETAIL_SYNC_JOB_STATUSES = ["queued", "running", "success", "partial"] as const

export const DETAIL_SYNC_ITEM_STATUSES = ["pending", "running", "success", "failed"] as const

export const EDITABLE_NODE_FIELDS = [
  "displayName",
  "description",
  "status",
  "releaseYear",
  "nsfw",
  "hidden",
  "notes",
  "image",
] as const
export const DEFAULT_PAGE_SIZE = 24
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
export const LOGIN_RATE_LIMIT_BLOCK_MS = 15 * 60 * 1000

export type MediaType = (typeof MEDIA_TYPES)[number]
export type NodeStatus = (typeof NODE_STATUSES)[number]
export type AttributeValueType = (typeof ATTRIBUTE_VALUE_TYPES)[number]
export type StorageMedium = (typeof STORAGE_MEDIA)[number]
export type EntrySource = (typeof ENTRY_SOURCES)[number]
export type Provider = (typeof PROVIDERS)[number]
export type CollectionMembership = (typeof COLLECTION_MEMBERSHIPS)[number]
export type ImageRole = (typeof IMAGE_ROLES)[number]
export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[number]
export type SyncTrigger = (typeof SYNC_TRIGGERS)[number]
export type DetailSyncJobStatus = (typeof DETAIL_SYNC_JOB_STATUSES)[number]
export type DetailSyncItemStatus = (typeof DETAIL_SYNC_ITEM_STATUSES)[number]
export type EditableNodeField = (typeof EDITABLE_NODE_FIELDS)[number]

export const NODE_STATUS_LABELS: Record<NodeStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  ON_HOLD: "On hold",
  DROPPED: "Dropped",
}

export const PROVIDER_LABELS: Record<Provider, string> = {
  steam: "Steam",
  mal: "MyAnimeList",
}
