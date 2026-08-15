import "@/lib/server-only"

import { eq } from "drizzle-orm"

import type { Provider } from "@/lib/constants"
import { createId } from "@/lib/helpers"
import { db } from "@/lib/db/client"
import { syncLeases } from "@/lib/db/schema"

export const SYNC_LEASE_TTL_MS = 10 * 60 * 1000
export const SYNC_PROCESS_OWNER = `${process.pid}-${createId()}`

export function acquireSyncLease(provider: Provider, ownerId = SYNC_PROCESS_OWNER) {
  const current = new Date()
  const expiresAt = new Date(current.getTime() + SYNC_LEASE_TTL_MS)
  let acquired = false

  db.transaction((tx) => {
    const existing = tx.query.syncLeases.findFirst({ where: eq(syncLeases.provider, provider) }).sync()

    if (!existing) {
      tx.insert(syncLeases)
        .values({
          provider,
          ownerId,
          expiresAt,
          heartbeatAt: current,
          createdAt: current,
          updatedAt: current,
        })
        .run()
      acquired = true
      return
    }

    if (existing.ownerId === ownerId || existing.expiresAt <= current) {
      tx.update(syncLeases)
        .set({
          ownerId,
          expiresAt,
          heartbeatAt: current,
          updatedAt: current,
        })
        .where(eq(syncLeases.provider, provider))
        .run()
      acquired = true
    }
  })

  return acquired
}

export function releaseSyncLease(provider: Provider, ownerId = SYNC_PROCESS_OWNER) {
  const existing = db.query.syncLeases.findFirst({ where: eq(syncLeases.provider, provider) }).sync()
  if (!existing || existing.ownerId !== ownerId) return false

  db.delete(syncLeases).where(eq(syncLeases.provider, provider)).run()
  return true
}

export function heartbeatSyncLease(provider: Provider, ownerId = SYNC_PROCESS_OWNER) {
  const current = new Date()
  const expiresAt = new Date(current.getTime() + SYNC_LEASE_TTL_MS)
  const existing = db.query.syncLeases.findFirst({ where: eq(syncLeases.provider, provider) }).sync()

  if (!existing || existing.ownerId !== ownerId) {
    return false
  }

  db.update(syncLeases)
    .set({
      expiresAt,
      heartbeatAt: current,
      updatedAt: current,
    })
    .where(eq(syncLeases.provider, provider))
    .run()

  return true
}
