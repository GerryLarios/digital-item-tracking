import "@/lib/server-only"

import { eq } from "drizzle-orm"

import { encryptSecret, decryptSecret } from "@/lib/crypto"
import type { Provider } from "@/lib/constants"
import { db } from "@/lib/db/client"
import { syncAccounts } from "@/lib/db/schema"
import { createId, parseJson } from "@/lib/helpers"

export type ParsedSyncAccount = {
  id: string
  provider: Provider
  enabled: boolean
  externalAccountId: string | null
  displayName: string | null
  accessToken: string | null
  refreshToken: string | null
  accessTokenExpiresAt: Date | null
  refreshTokenExpiresAt: Date | null
  config: Record<string, unknown>
  profile: Record<string, unknown>
  lastSyncedAt: Date | null
  lastSuccessfulSyncAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function parseAccount(record: typeof syncAccounts.$inferSelect): ParsedSyncAccount {
  return {
    id: record.id,
    provider: record.provider,
    enabled: record.enabled,
    externalAccountId: record.externalAccountId,
    displayName: record.displayName,
    accessToken: decryptSecret(record.accessTokenEncrypted),
    refreshToken: decryptSecret(record.refreshTokenEncrypted),
    accessTokenExpiresAt: record.accessTokenExpiresAt,
    refreshTokenExpiresAt: record.refreshTokenExpiresAt,
    config: parseJson<Record<string, unknown>>(record.configJson, {}),
    profile: parseJson<Record<string, unknown>>(record.profileJson, {}),
    lastSyncedAt: record.lastSyncedAt,
    lastSuccessfulSyncAt: record.lastSuccessfulSyncAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export function getSyncAccount(provider: Provider) {
  const record = db.query.syncAccounts.findFirst({ where: eq(syncAccounts.provider, provider) }).sync()
  return record ? parseAccount(record) : null
}

export function listSyncAccounts() {
  return db.query.syncAccounts.findMany().sync().map(parseAccount)
}

export function upsertSyncAccount(
  provider: Provider,
  values: Partial<{
    enabled: boolean
    externalAccountId: string | null
    displayName: string | null
    accessToken: string | null
    refreshToken: string | null
    accessTokenExpiresAt: Date | null
    refreshTokenExpiresAt: Date | null
    config: Record<string, unknown>
    profile: Record<string, unknown>
    lastSyncedAt: Date | null
    lastSuccessfulSyncAt: Date | null
    userId: string | null
  }>,
) {
  const now = new Date()
  const existing = db.query.syncAccounts.findFirst({ where: eq(syncAccounts.provider, provider) }).sync()

  const nextValues = {
    provider,
    enabled: values.enabled ?? existing?.enabled ?? true,
    externalAccountId: values.externalAccountId ?? existing?.externalAccountId ?? null,
    displayName: values.displayName ?? existing?.displayName ?? null,
    accessTokenEncrypted: values.accessToken === undefined
      ? existing?.accessTokenEncrypted ?? null
      : encryptSecret(values.accessToken),
    refreshTokenEncrypted: values.refreshToken === undefined
      ? existing?.refreshTokenEncrypted ?? null
      : encryptSecret(values.refreshToken),
    accessTokenExpiresAt:
      values.accessTokenExpiresAt === undefined
        ? existing?.accessTokenExpiresAt ?? null
        : values.accessTokenExpiresAt,
    refreshTokenExpiresAt:
      values.refreshTokenExpiresAt === undefined
        ? existing?.refreshTokenExpiresAt ?? null
        : values.refreshTokenExpiresAt,
    configJson: JSON.stringify(values.config ?? parseJson(existing?.configJson, {})),
    profileJson: JSON.stringify(values.profile ?? parseJson(existing?.profileJson, {})),
    lastSyncedAt: values.lastSyncedAt === undefined ? existing?.lastSyncedAt ?? null : values.lastSyncedAt,
    lastSuccessfulSyncAt:
      values.lastSuccessfulSyncAt === undefined
        ? existing?.lastSuccessfulSyncAt ?? null
        : values.lastSuccessfulSyncAt,
    userId: values.userId ?? existing?.userId ?? null,
    updatedAt: now,
  }

  if (existing) {
    db.update(syncAccounts).set(nextValues).where(eq(syncAccounts.provider, provider)).run()
  } else {
    db.insert(syncAccounts)
      .values({
        id: createId(),
        createdAt: now,
        ...nextValues,
      })
      .run()
  }

  return getSyncAccount(provider)
}

export function configureSteamAccount({
  steamId,
  wishlistShareUrl,
  enabled,
  userId,
}: {
  steamId: string | null
  wishlistShareUrl?: string | null
  enabled: boolean
  userId: string | null
}) {
  return upsertSyncAccount("steam", {
    enabled,
    accessToken: wishlistShareUrl,
    config: { steamId },
    userId,
  })
}

export function disconnectProvider(provider: Provider) {
  const account = getSyncAccount(provider)
  if (!account) return

  upsertSyncAccount(provider, {
    enabled: false,
    accessToken: null,
    refreshToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    profile: {},
    config: provider === "steam" ? account.config : {},
  })
}
