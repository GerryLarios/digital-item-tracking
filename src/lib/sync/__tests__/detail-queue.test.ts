import { eq } from "drizzle-orm"
import { describe, expect, it, vi } from "vitest"

import { db } from "@/lib/db/client"
import { detailSyncItems, detailSyncJobs, externalRefs, nodes } from "@/lib/db/schema"
import { createId } from "@/lib/helpers"
import { ProviderParseError } from "@/lib/providers/types"

const syncNodeDetails = vi.hoisted(() => vi.fn())

vi.mock("@/lib/sync/item-details", () => ({ syncNodeDetails }))

const {
  enqueueDetailSync,
  getDetailSyncProgress,
  processNextDetailSyncItem,
  recoverInterruptedDetailSync,
  retryDetailSyncItem,
  retryFailedDetailSync,
} = await import("@/lib/sync/detail-queue")

function insertProviderNode(externalId: string, isActive = true, provider: "steam" | "mal" = "steam") {
  const now = new Date()
  const nodeId = createId()
  db.insert(nodes)
    .values({
      id: nodeId,
      mediaType: provider === "mal" ? "ANIME" : "GAME",
      displayName: `Game ${externalId}`,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  db.insert(externalRefs)
    .values({
      id: createId(),
      nodeId,
      provider,
      externalId,
      isActive,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  return nodeId
}

describe("bulk item detail queue", () => {
  it("snapshots distinct active nodes and prevents overlapping jobs", () => {
    const nodeId = insertProviderNode("100")
    const now = new Date()
    db.insert(externalRefs)
      .values({
        id: createId(),
        nodeId,
        provider: "mal",
        externalId: "101",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    insertProviderNode("102", false)

    const first = enqueueDetailSync()
    const second = enqueueDetailSync()

    expect(first.created).toBe(true)
    expect(second).toEqual({ jobId: first.jobId, created: false })
    expect(getDetailSyncProgress()?.counts.total).toBe(1)
  })

  it("continues after failures and completes with partial status", async () => {
    const successfulNode = insertProviderNode("200")
    const failedNode = insertProviderNode("201")
    enqueueDetailSync()
    syncNodeDetails.mockImplementation(async (nodeId: string) => {
      if (nodeId === failedNode) throw new Error("Steam unavailable")
      return { updated: ["steam"], failures: ["MAL unavailable"], responses: [] }
    })

    await processNextDetailSyncItem()
    await processNextDetailSyncItem()

    const progress = getDetailSyncProgress()
    expect(syncNodeDetails).toHaveBeenCalledWith(successfulNode, undefined)
    expect(syncNodeDetails).toHaveBeenCalledWith(failedNode, undefined)
    expect(progress?.status).toBe("partial")
    expect(progress?.counts).toMatchObject({
      total: 2,
      processed: 2,
      succeeded: 1,
      failed: 1,
    })
    expect(progress?.errors[0].message).toBe("Steam unavailable")
    expect(progress?.warnings[0].message).toBe("MAL unavailable")
  })

  it("stores the raw provider response for a failed item", async () => {
    insertProviderNode("700")
    enqueueDetailSync()
    const rawResponse = {
      700: {
        success: true,
        data: { name: "Broken", content_descriptors: { ids: "oops" } },
      },
    }
    syncNodeDetails.mockRejectedValueOnce(
      new ProviderParseError("Invalid input", rawResponse),
    )

    await processNextDetailSyncItem()

    const progress = getDetailSyncProgress()
    expect(progress?.status).toBe("partial")
    expect(progress?.errors[0].message).toBe("Invalid input")
    expect(progress?.errors[0].responseJson).toBe(JSON.stringify(rawResponse))
  })

  it("scopes the queue to a single provider when requested", async () => {
    insertProviderNode("600")
    const malNode = insertProviderNode("601", true, "mal")
    enqueueDetailSync("mal")
    syncNodeDetails.mockResolvedValueOnce({ updated: ["mal"], failures: [], responses: [] })

    await processNextDetailSyncItem()

    expect(getDetailSyncProgress()?.counts.total).toBe(1)
    expect(getDetailSyncProgress()?.provider).toBe("mal")
    expect(syncNodeDetails).toHaveBeenCalledWith(malNode, "mal")
  })

  it("recovers an interrupted item after restart", () => {
    insertProviderNode("300")
    const { jobId } = enqueueDetailSync()
    const item = db.query.detailSyncItems.findFirst({
      where: eq(detailSyncItems.jobId, jobId),
    }).sync()
    const now = new Date()
    db.update(detailSyncJobs)
      .set({ status: "running", startedAt: now })
      .where(eq(detailSyncJobs.id, jobId))
      .run()
    db.update(detailSyncItems)
      .set({ status: "running", startedAt: now })
      .where(eq(detailSyncItems.id, item!.id))
      .run()

    expect(recoverInterruptedDetailSync()).toBe(true)
    expect(db.query.detailSyncJobs.findFirst({
      where: eq(detailSyncJobs.id, jobId),
    }).sync()?.status).toBe("queued")
    expect(db.query.detailSyncItems.findFirst({
      where: eq(detailSyncItems.id, item!.id),
    }).sync()?.status).toBe("pending")
  })

  it("requeues only failed rows for an explicit retry", async () => {
    insertProviderNode("400")
    const { jobId } = enqueueDetailSync()
    syncNodeDetails.mockRejectedValueOnce(new Error("Temporary failure"))
    await processNextDetailSyncItem()

    retryFailedDetailSync(jobId)
    const queued = getDetailSyncProgress()
    expect(queued?.status).toBe("queued")
    expect(queued?.counts.pending).toBe(1)

    syncNodeDetails.mockResolvedValueOnce({ updated: ["steam"], failures: [], responses: [] })
    await processNextDetailSyncItem()
    const complete = getDetailSyncProgress()
    expect(complete?.status).toBe("success")
    expect(complete?.counts.succeeded).toBe(1)
    expect(db.query.detailSyncItems.findFirst({
      where: eq(detailSyncItems.jobId, jobId),
    }).sync()?.attempts).toBe(2)
  })

  it("re-syncs a single failed item and leaves the rest untouched", async () => {
    const failedNode = insertProviderNode("500")
    insertProviderNode("501")
    enqueueDetailSync()
    syncNodeDetails.mockImplementation(async (nodeId: string) => {
      if (nodeId === failedNode) throw new Error("Temporary failure")
      return { updated: ["steam"], failures: [], responses: [] }
    })
    await processNextDetailSyncItem()
    await processNextDetailSyncItem()

    const failedItem = getDetailSyncProgress()?.errors[0]
    expect(failedItem?.message).toBe("Temporary failure")

    retryDetailSyncItem(failedItem!.id)
    const requeued = getDetailSyncProgress()
    expect(requeued?.status).toBe("queued")
    expect(requeued?.counts.pending).toBe(1)
    expect(requeued?.counts.succeeded).toBe(1)

    syncNodeDetails.mockResolvedValueOnce({ updated: ["steam"], failures: [], responses: [] })
    await processNextDetailSyncItem()
    const complete = getDetailSyncProgress()
    expect(complete?.status).toBe("success")
    expect(complete?.counts.succeeded).toBe(2)
  })
})
