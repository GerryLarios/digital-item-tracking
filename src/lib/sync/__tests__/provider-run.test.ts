import { eq } from "drizzle-orm"
import { describe, expect, it, vi } from "vitest"

import { db } from "@/lib/db/client"
import { syncRunItems } from "@/lib/db/schema"
import { resetEnvCache } from "@/lib/env"
import { configureSteamAccount } from "@/lib/integrations/service"
import type { RemoteCatalogItem } from "@/lib/providers/types"
import {
  enqueueProviderSync,
  getProviderSyncProgress,
  processProviderRun,
  retryProviderRunItem,
} from "@/lib/sync/provider-run"

const reconcileRemoteItem = vi.hoisted(() => vi.fn())

vi.mock("@/lib/sync/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sync/service")>()
  return { ...actual, reconcileRemoteItem }
})

describe("provider sync runs", () => {
  it("records a failed item and re-syncs it on retry", async () => {
    process.env.STEAM_API_KEY = "test-steam-key"
    resetEnvCache()

    configureSteamAccount({ steamId: "76561198000000000", enabled: true, userId: null })

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("GetOwnedGames")) {
        return new Response(
          JSON.stringify({
            response: {
              games: [
                { appid: 10, name: "Hades", playtime_forever: 60 },
                { appid: 11, name: "Celeste", playtime_forever: 0 },
              ],
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        )
      }
      if (url.includes("IWishlistService/GetWishlist")) {
        return new Response(JSON.stringify({ response: {} }), {
          headers: { "Content-Type": "application/json" },
        })
      }
      if (url.includes("IStoreBrowseService/GetItems")) {
        return new Response(JSON.stringify({ response: { store_items: [] } }), {
          headers: { "Content-Type": "application/json" },
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    let failedOnce = false
    reconcileRemoteItem.mockImplementation(async (remote: RemoteCatalogItem) => {
      if (remote.externalId === "11" && !failedOnce) {
        failedOnce = true
        throw new Error("Image download failed")
      }
      return { nodeId: null, created: true }
    })

    const { runId } = enqueueProviderSync("steam")
    const result = await processProviderRun(runId)

    expect(
      reconcileRemoteItem.mock.calls.map(([remote]) => remote.externalId),
      "reconcile call externalIds",
    ).toEqual(["10", "11"])
    expect(result?.status).toBe("partial")
    expect(result?.stats).toMatchObject({ importedItems: 1, failedItems: 1 })
    expect(getProviderSyncProgress()).toHaveLength(0)
    expect(getProviderSyncProgress()).toHaveLength(0)

    const failed = db.select()
      .from(syncRunItems)
      .where(eq(syncRunItems.runId, runId))
      .all()
      .find((row) => row.externalId === "11")
    expect(failed?.status).toBe("failed")
    expect(failed?.errorText).toBe("Image download failed")

    retryProviderRunItem(runId, failed!.id)
    expect(db.select().from(syncRunItems).where(eq(syncRunItems.id, failed!.id)).get()?.status).toBe(
      "pending",
    )

    const retryResult = await processProviderRun(runId)
    expect(retryResult?.status).toBe("success")
    expect(retryResult?.stats.failedItems).toBe(0)
    expect(db.select().from(syncRunItems).where(eq(syncRunItems.id, failed!.id)).get()?.status).toBe(
      "success",
    )

    fetchSpy.mockRestore()
  })
})
