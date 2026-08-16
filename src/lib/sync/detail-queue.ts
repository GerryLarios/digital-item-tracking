import "@/lib/server-only"

import { and, asc, count, desc, eq, sql } from "drizzle-orm"

import type { Provider } from "@/lib/constants"
import { db } from "@/lib/db/client"
import { detailSyncItems, detailSyncJobs, externalRefs, nodes } from "@/lib/db/schema"
import { createId } from "@/lib/helpers"
import { ProviderParseError } from "@/lib/providers/types"
import { syncNodeDetails } from "@/lib/sync/item-details"

const ACTIVE_JOB_KEY = "bulk-item-details"

export type DetailSyncProgress = ReturnType<typeof getDetailSyncProgress>

function getActiveJob() {
  return db.select()
    .from(detailSyncJobs)
    .where(eq(detailSyncJobs.activeKey, ACTIVE_JOB_KEY))
    .get()
}

function finishJobIfComplete(jobId: string) {
  const unfinished = db.select({ count: count() })
    .from(detailSyncItems)
    .where(
      and(
        eq(detailSyncItems.jobId, jobId),
        sql`${detailSyncItems.status} in ('pending', 'running')`,
      ),
    )
    .get()

  if ((unfinished?.count ?? 0) > 0) return false

  const failed = db.select({ count: count() })
    .from(detailSyncItems)
    .where(and(eq(detailSyncItems.jobId, jobId), eq(detailSyncItems.status, "failed")))
    .get()
  const now = new Date()

  db.update(detailSyncJobs)
    .set({
      status: (failed?.count ?? 0) > 0 ? "partial" : "success",
      activeKey: null,
      finishedAt: now,
      updatedAt: now,
    })
    .where(eq(detailSyncJobs.id, jobId))
    .run()

  return true
}

export function enqueueDetailSync(provider?: Provider) {
  const activeJob = getActiveJob()
  if (activeJob) return { jobId: activeJob.id, created: false }

  const nodeIds = db.selectDistinct({ nodeId: externalRefs.nodeId })
    .from(externalRefs)
    .where(and(eq(externalRefs.isActive, true), provider ? eq(externalRefs.provider, provider) : undefined))
    .all()
  const now = new Date()
  const jobId = createId()

  db.transaction((tx) => {
    tx.insert(detailSyncJobs)
      .values({
        id: jobId,
        provider: provider ?? null,
        status: nodeIds.length ? "queued" : "success",
        activeKey: nodeIds.length ? ACTIVE_JOB_KEY : null,
        finishedAt: nodeIds.length ? null : now,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    if (nodeIds.length) {
      tx.insert(detailSyncItems)
        .values(
          nodeIds.map(({ nodeId }) => ({
            id: createId(),
            jobId,
            nodeId,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .run()
    }
  })

  return { jobId, created: true }
}

export function recoverInterruptedDetailSync() {
  const activeJob = getActiveJob()
  if (!activeJob) return false

  const now = new Date()
  db.transaction((tx) => {
    tx.update(detailSyncItems)
      .set({
        status: "pending",
        startedAt: null,
        finishedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(detailSyncItems.jobId, activeJob.id),
          eq(detailSyncItems.status, "running"),
        ),
      )
      .run()
    tx.update(detailSyncJobs)
      .set({ status: "queued", updatedAt: now })
      .where(eq(detailSyncJobs.id, activeJob.id))
      .run()
  })

  return true
}

export async function processNextDetailSyncItem() {
  const activeJob = getActiveJob()
  if (!activeJob) return false

  const item = db.select()
    .from(detailSyncItems)
    .where(
      and(
      eq(detailSyncItems.jobId, activeJob.id),
      eq(detailSyncItems.status, "pending"),
      ),
    )
    .orderBy(asc(detailSyncItems.createdAt))
    .get()

  if (!item) {
    finishJobIfComplete(activeJob.id)
    return false
  }

  const startedAt = new Date()
  db.transaction((tx) => {
    tx.update(detailSyncJobs)
      .set({
        status: "running",
        startedAt: activeJob.startedAt ?? startedAt,
        updatedAt: startedAt,
      })
      .where(eq(detailSyncJobs.id, activeJob.id))
      .run()
    tx.update(detailSyncItems)
      .set({
        status: "running",
        attempts: item.attempts + 1,
        errorText: null,
        startedAt,
        finishedAt: null,
        updatedAt: startedAt,
      })
      .where(eq(detailSyncItems.id, item.id))
      .run()
  })

  try {
    const result = await syncNodeDetails(item.nodeId, activeJob.provider ?? undefined)
    const finishedAt = new Date()
    db.update(detailSyncItems)
      .set({
        status: "success",
        warningText: result.failures.length ? result.failures.join(" ") : null,
        responseJson: result.responses.length ? JSON.stringify(result.responses) : null,
        finishedAt,
        updatedAt: finishedAt,
      })
      .where(eq(detailSyncItems.id, item.id))
      .run()
  } catch (error) {
    const finishedAt = new Date()
    db.update(detailSyncItems)
      .set({
        status: "failed",
        errorText: error instanceof Error ? error.message : String(error),
        responseJson:
          error instanceof ProviderParseError && error.response !== undefined
            ? JSON.stringify(error.response)
            : null,
        finishedAt,
        updatedAt: finishedAt,
      })
      .where(eq(detailSyncItems.id, item.id))
      .run()
  }

  finishJobIfComplete(activeJob.id)
  return true
}

export function retryFailedDetailSync(jobId: string) {
  if (getActiveJob()) {
    throw new Error("A detail sync is already running.")
  }

  const job = db.select()
    .from(detailSyncJobs)
    .where(and(eq(detailSyncJobs.id, jobId), eq(detailSyncJobs.status, "partial")))
    .get()
  if (!job) {
    throw new Error("The selected detail sync has no failed items to retry.")
  }

  const failedItems = db.select({ count: count() })
    .from(detailSyncItems)
    .where(and(eq(detailSyncItems.jobId, jobId), eq(detailSyncItems.status, "failed")))
    .get()
  if (!(failedItems?.count ?? 0)) {
    throw new Error("The selected detail sync has no failed items to retry.")
  }

  const now = new Date()
  db.transaction((tx) => {
    tx.update(detailSyncItems)
      .set({
        status: "pending",
        warningText: null,
        errorText: null,
        responseJson: null,
        startedAt: null,
        finishedAt: null,
        updatedAt: now,
      })
      .where(and(eq(detailSyncItems.jobId, jobId), eq(detailSyncItems.status, "failed")))
      .run()
    tx.update(detailSyncJobs)
      .set({
        status: "queued",
        activeKey: ACTIVE_JOB_KEY,
        finishedAt: null,
        updatedAt: now,
      })
      .where(eq(detailSyncJobs.id, jobId))
      .run()
  })
}

export function retryDetailSyncItem(itemId: string) {
  if (getActiveJob()) {
    throw new Error("A detail sync is already running.")
  }

  const item = db.query.detailSyncItems.findFirst({ where: eq(detailSyncItems.id, itemId) }).sync()
  if (!item || item.status !== "failed") {
    throw new Error("The selected item is not a failed detail sync item.")
  }

  const job = db.select()
    .from(detailSyncJobs)
    .where(and(eq(detailSyncJobs.id, item.jobId), eq(detailSyncJobs.status, "partial")))
    .get()
  if (!job) {
    throw new Error("The selected item belongs to a completed detail sync.")
  }

  const now = new Date()
  db.transaction((tx) => {
    tx.update(detailSyncItems)
      .set({
        status: "pending",
        errorText: null,
        responseJson: null,
        startedAt: null,
        finishedAt: null,
        updatedAt: now,
      })
      .where(eq(detailSyncItems.id, itemId))
      .run()
    tx.update(detailSyncJobs)
      .set({
        status: "queued",
        activeKey: ACTIVE_JOB_KEY,
        finishedAt: null,
        updatedAt: now,
      })
      .where(eq(detailSyncJobs.id, item.jobId))
      .run()
  })
}

export function getDetailSyncProgress() {
  const job = db.select()
    .from(detailSyncJobs)
    .orderBy(desc(detailSyncJobs.createdAt))
    .get()
  if (!job) return null

  const counts = db.select({
    total: count(),
    pending: sql<number>`coalesce(sum(case when ${detailSyncItems.status} = 'pending' then 1 else 0 end), 0)`,
    running: sql<number>`coalesce(sum(case when ${detailSyncItems.status} = 'running' then 1 else 0 end), 0)`,
    succeeded: sql<number>`coalesce(sum(case when ${detailSyncItems.status} = 'success' then 1 else 0 end), 0)`,
    failed: sql<number>`coalesce(sum(case when ${detailSyncItems.status} = 'failed' then 1 else 0 end), 0)`,
  })
    .from(detailSyncItems)
    .where(eq(detailSyncItems.jobId, job.id))
    .get()

  const errors = db.select({
    id: detailSyncItems.id,
    nodeId: detailSyncItems.nodeId,
    displayName: nodes.displayName,
    message: detailSyncItems.errorText,
    responseJson: detailSyncItems.responseJson,
  })
    .from(detailSyncItems)
    .innerJoin(nodes, eq(nodes.id, detailSyncItems.nodeId))
    .where(and(eq(detailSyncItems.jobId, job.id), eq(detailSyncItems.status, "failed")))
    .orderBy(asc(detailSyncItems.finishedAt))
    .all()

  const warnings = db.select({
    nodeId: detailSyncItems.nodeId,
    displayName: nodes.displayName,
    message: detailSyncItems.warningText,
  })
    .from(detailSyncItems)
    .innerJoin(nodes, eq(nodes.id, detailSyncItems.nodeId))
    .where(
      and(
        eq(detailSyncItems.jobId, job.id),
        sql`${detailSyncItems.warningText} is not null`,
      ),
    )
    .orderBy(asc(detailSyncItems.finishedAt))
    .limit(5)
    .all()

  return {
    ...job,
    counts: {
      total: counts?.total ?? 0,
      pending: counts?.pending ?? 0,
      running: counts?.running ?? 0,
      succeeded: counts?.succeeded ?? 0,
      failed: counts?.failed ?? 0,
      processed: (counts?.succeeded ?? 0) + (counts?.failed ?? 0),
    },
    errors,
    warnings,
  }
}
