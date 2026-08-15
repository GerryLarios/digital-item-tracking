import { relations, sql } from "drizzle-orm"
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

import {
  ATTRIBUTE_VALUE_TYPES,
  DETAIL_SYNC_ITEM_STATUSES,
  DETAIL_SYNC_JOB_STATUSES,
  ENTRY_SOURCES,
  IMAGE_ROLES,
  MEDIA_TYPES,
  NODE_STATUSES,
  PROVIDERS,
  STORAGE_MEDIA,
  SYNC_RUN_STATUSES,
  SYNC_TRIGGERS,
} from "@/lib/constants"

const nowSql = sql`(unixepoch() * 1000)`
const jsonArrayDefault = sql`'[]'`
const jsonObjectDefault = sql`'{}'`

const timestampMs = (name: string) => integer(name, { mode: "timestamp_ms" })

export const users = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: timestampMs("created_at").notNull().default(nowSql),
  updatedAt: timestampMs("updated_at").notNull().default(nowSql),
})

export const sessions = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestampMs("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestampMs("created_at").notNull().default(nowSql),
    updatedAt: timestampMs("updated_at").notNull().default(nowSql),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
)

export const accounts = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestampMs("access_token_expires_at"),
    refreshTokenExpiresAt: timestampMs("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestampMs("created_at").notNull().default(nowSql),
    updatedAt: timestampMs("updated_at").notNull().default(nowSql),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_unique").on(table.providerId, table.accountId),
  ],
)

export const verifications = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
    createdAt: timestampMs("created_at").notNull().default(nowSql),
    updatedAt: timestampMs("updated_at").notNull().default(nowSql),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
)

export const authRateLimits = sqliteTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStartedAt: timestampMs("window_started_at").notNull().default(nowSql),
  blockedUntil: timestampMs("blocked_until"),
  createdAt: timestampMs("created_at").notNull().default(nowSql),
  updatedAt: timestampMs("updated_at").notNull().default(nowSql),
})

export const nodes = sqliteTable(
  "nodes",
  {
    id: text("id").primaryKey(),
    mediaType: text("media_type", { enum: MEDIA_TYPES }).notNull(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    status: text("status", { enum: NODE_STATUSES }).notNull().default("NOT_STARTED"),
    releaseYear: integer("release_year"),
    nsfw: integer("nsfw", { mode: "boolean" }).notNull().default(false),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    notes: text("notes"),
    overrideFields: text("override_fields").notNull().default(jsonArrayDefault),
    createdAt: timestampMs("created_at").notNull().default(nowSql),
    updatedAt: timestampMs("updated_at").notNull().default(nowSql),
  },
  (table) => [
    index("nodes_status_idx").on(table.status),
    index("nodes_display_name_idx").on(table.displayName),
    index("nodes_library_filter_idx").on(
      table.mediaType,
      table.status,
      table.hidden,
      table.nsfw,
    ),
  ],
)

export const nodeAttributes = sqliteTable(
  "node_attributes",
  {
    id: text("id").primaryKey(),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    valueType: text("value_type", { enum: ATTRIBUTE_VALUE_TYPES }).notNull().default("text"),
    source: text("source", { enum: ENTRY_SOURCES }).notNull().default("manual"),
    sourceProvider: text("source_provider", { enum: PROVIDERS }),
    lastSeenAt: timestampMs("last_seen_at"),
    createdAt: timestampMs("created_at").notNull().default(nowSql),
    updatedAt: timestampMs("updated_at").notNull().default(nowSql),
  },
  (table) => [
    uniqueIndex("node_attributes_unique").on(table.nodeId, table.key, table.value),
    index("node_attributes_node_id_idx").on(table.nodeId),
    index("node_attributes_provider_idx").on(table.sourceProvider),
  ],
)

export const storageLocations = sqliteTable(
  "storage_locations",
  {
    id: text("id").primaryKey(),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    medium: text("medium", { enum: STORAGE_MEDIA }).notNull().default("physical"),
    platform: text("platform"),
    notes: text("notes"),
    source: text("source", { enum: ENTRY_SOURCES }).notNull().default("manual"),
    sourceProvider: text("source_provider", { enum: PROVIDERS }),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastSeenAt: timestampMs("last_seen_at"),
    createdAt: timestampMs("created_at").notNull().default(nowSql),
    updatedAt: timestampMs("updated_at").notNull().default(nowSql),
  },
  (table) => [
    index("storage_locations_node_id_idx").on(table.nodeId),
    index("storage_locations_medium_idx").on(table.medium),
    index("storage_locations_provider_idx").on(table.sourceProvider),
  ],
)

export const externalRefs = sqliteTable(
  "external_refs",
  {
    id: text("id").primaryKey(),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: PROVIDERS }).notNull(),
    externalId: text("external_id").notNull(),
    externalUrl: text("external_url"),
    mediaType: text("media_type", { enum: MEDIA_TYPES }),
    listMemberships: text("list_memberships").notNull().default(jsonArrayDefault),
    remoteStatus: text("remote_status"),
    remoteUpdatedAt: timestampMs("remote_updated_at"),
    remoteCreatedAt: timestampMs("remote_created_at"),
    lastSeenAt: timestampMs("last_seen_at"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sourceData: text("source_data").notNull().default(jsonObjectDefault),
    createdAt: timestampMs("created_at").notNull().default(nowSql),
    updatedAt: timestampMs("updated_at").notNull().default(nowSql),
  },
  (table) => [
    uniqueIndex("external_refs_provider_external_id_unique").on(
      table.provider,
      table.externalId,
    ),
    index("external_refs_node_id_idx").on(table.nodeId),
    index("external_refs_provider_idx").on(table.provider, table.nodeId),
  ],
)

export const nodeLinks = sqliteTable(
  "node_links",
  {
    id: text("id").primaryKey(),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    createdAt: timestampMs("created_at").notNull().default(nowSql),
    updatedAt: timestampMs("updated_at").notNull().default(nowSql),
  },
  (table) => [index("node_links_node_id_idx").on(table.nodeId)],
)

export const images = sqliteTable(
  "images",
  {
    id: text("id").primaryKey(),
    assetKey: text("asset_key").notNull(),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    role: text("role", { enum: IMAGE_ROLES }).notNull(),
    path: text("path").notNull(),
    mimeType: text("mime_type").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    byteSize: integer("byte_size").notNull(),
    checksum: text("checksum").notNull(),
    sourceUrl: text("source_url"),
    sourceProvider: text("source_provider", { enum: PROVIDERS }),
    sortOrder: integer("sort_order").notNull().default(0),
    managed: integer("managed", { mode: "boolean" }).notNull().default(false),
    createdAt: timestampMs("created_at").notNull().default(nowSql),
    updatedAt: timestampMs("updated_at").notNull().default(nowSql),
  },
  (table) => [
    index("images_node_id_idx").on(table.nodeId, table.role, table.sortOrder),
    uniqueIndex("images_asset_role_unique").on(table.assetKey, table.role),
    uniqueIndex("images_single_main_per_node").on(table.nodeId).where(sql`${table.role} = 'main'`),
  ],
)

export const syncAccounts = sqliteTable(
  "sync_accounts",
  {
    id: text("id").primaryKey(),
    provider: text("provider", { enum: PROVIDERS }).notNull().unique(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    externalAccountId: text("external_account_id"),
    displayName: text("display_name"),
    accessTokenEncrypted: text("access_token_encrypted"),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    accessTokenExpiresAt: timestampMs("access_token_expires_at"),
    refreshTokenExpiresAt: timestampMs("refresh_token_expires_at"),
    configJson: text("config_json").notNull().default(jsonObjectDefault),
    profileJson: text("profile_json").notNull().default(jsonObjectDefault),
    lastSyncedAt: timestampMs("last_synced_at"),
    lastSuccessfulSyncAt: timestampMs("last_successful_sync_at"),
    createdAt: timestampMs("created_at").notNull().default(nowSql),
    updatedAt: timestampMs("updated_at").notNull().default(nowSql),
  },
  (table) => [index("sync_accounts_provider_idx").on(table.provider)],
)

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: text("id").primaryKey(),
    provider: text("provider", { enum: PROVIDERS }).notNull(),
    trigger: text("trigger", { enum: SYNC_TRIGGERS }).notNull().default("manual"),
    status: text("status", { enum: SYNC_RUN_STATUSES }).notNull().default("running"),
    startedAt: timestampMs("started_at").notNull().default(nowSql),
    finishedAt: timestampMs("finished_at"),
    statsJson: text("stats_json").notNull().default(jsonObjectDefault),
    errorText: text("error_text"),
    metadataJson: text("metadata_json").notNull().default(jsonObjectDefault),
    createdAt: timestampMs("created_at").notNull().default(nowSql),
    updatedAt: timestampMs("updated_at").notNull().default(nowSql),
  },
  (table) => [
    index("sync_runs_provider_idx").on(table.provider, table.startedAt),
    index("sync_runs_status_idx").on(table.status),
  ],
)

export const syncLeases = sqliteTable("sync_leases", {
  provider: text("provider", { enum: PROVIDERS }).primaryKey(),
  ownerId: text("owner_id").notNull(),
  expiresAt: timestampMs("expires_at").notNull(),
  heartbeatAt: timestampMs("heartbeat_at").notNull().default(nowSql),
  createdAt: timestampMs("created_at").notNull().default(nowSql),
  updatedAt: timestampMs("updated_at").notNull().default(nowSql),
})

export const detailSyncJobs = sqliteTable(
  "detail_sync_jobs",
  {
    id: text("id").primaryKey(),
    status: text("status", { enum: DETAIL_SYNC_JOB_STATUSES }).notNull().default("queued"),
    activeKey: text("active_key").unique(),
    startedAt: timestampMs("started_at"),
    finishedAt: timestampMs("finished_at"),
    createdAt: timestampMs("created_at").notNull().default(nowSql),
    updatedAt: timestampMs("updated_at").notNull().default(nowSql),
  },
  (table) => [index("detail_sync_jobs_status_idx").on(table.status, table.createdAt)],
)

export const detailSyncItems = sqliteTable(
  "detail_sync_items",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => detailSyncJobs.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    status: text("status", { enum: DETAIL_SYNC_ITEM_STATUSES }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    warningText: text("warning_text"),
    errorText: text("error_text"),
    startedAt: timestampMs("started_at"),
    finishedAt: timestampMs("finished_at"),
    createdAt: timestampMs("created_at").notNull().default(nowSql),
    updatedAt: timestampMs("updated_at").notNull().default(nowSql),
  },
  (table) => [
    uniqueIndex("detail_sync_items_job_node_unique").on(table.jobId, table.nodeId),
    index("detail_sync_items_claim_idx").on(table.jobId, table.status, table.createdAt),
  ],
)

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestampMs("updated_at").notNull().default(nowSql),
})

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  syncAccounts: many(syncAccounts),
}))

export const nodesRelations = relations(nodes, ({ many }) => ({
  attributes: many(nodeAttributes),
  storageLocations: many(storageLocations),
  externalRefs: many(externalRefs),
  links: many(nodeLinks),
  images: many(images),
}))

export const nodeAttributesRelations = relations(nodeAttributes, ({ one }) => ({
  node: one(nodes, { fields: [nodeAttributes.nodeId], references: [nodes.id] }),
}))

export const storageLocationsRelations = relations(storageLocations, ({ one }) => ({
  node: one(nodes, { fields: [storageLocations.nodeId], references: [nodes.id] }),
}))

export const externalRefsRelations = relations(externalRefs, ({ one }) => ({
  node: one(nodes, { fields: [externalRefs.nodeId], references: [nodes.id] }),
}))

export const nodeLinksRelations = relations(nodeLinks, ({ one }) => ({
  node: one(nodes, { fields: [nodeLinks.nodeId], references: [nodes.id] }),
}))

export const imagesRelations = relations(images, ({ one }) => ({
  node: one(nodes, { fields: [images.nodeId], references: [nodes.id] }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}))

export const syncAccountsRelations = relations(syncAccounts, ({ one }) => ({
  user: one(users, { fields: [syncAccounts.userId], references: [users.id] }),
}))

export const detailSyncJobsRelations = relations(detailSyncJobs, ({ many }) => ({
  items: many(detailSyncItems),
}))

export const detailSyncItemsRelations = relations(detailSyncItems, ({ one }) => ({
  job: one(detailSyncJobs, {
    fields: [detailSyncItems.jobId],
    references: [detailSyncJobs.id],
  }),
  node: one(nodes, { fields: [detailSyncItems.nodeId], references: [nodes.id] }),
}))
