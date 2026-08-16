import sharp from "sharp"
import { describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { externalRefs, nodeAttributes } from "@/lib/db/schema"
import { resetEnvCache } from "@/lib/env"
import { configureSteamAccount } from "@/lib/integrations/service"
import { getNodeById, listNodes, saveManualNode } from "@/lib/library/service"
import { enqueueProviderSync, processProviderRun } from "@/lib/sync/provider-run"
import { reconcileRemoteItem } from "@/lib/sync/service"

const PNG_BUFFER = await sharp({
  create: {
    width: 8,
    height: 8,
    channels: 4,
    background: { r: 255, g: 0, b: 0, alpha: 1 },
  },
})
  .png()
  .toBuffer()

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  })
}

function imageResponse(buffer = PNG_BUFFER) {
  return new Response(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(buffer.byteLength),
    },
  })
}

async function runSteamSync() {
  const { runId } = enqueueProviderSync("steam")
  const result = await processProviderRun(runId)
  if (!result) throw new Error("Sync run did not process.")
  return result
}

describe("sync orchestration", () => {
  it("dedupes duplicate node attributes before inserting them", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    await reconcileRemoteItem(
      {
        provider: "mal",
        externalId: "1",
        mediaType: "ANIME",
        title: "Frieren",
        memberships: ["list"],
        attributes: [
          { key: "genre", value: "Fantasy", valueType: "text" },
          { key: "genre", value: "Fantasy", valueType: "text" },
          { key: "genre", value: "Adventure", valueType: "text" },
        ],
      },
      [],
    )

    const node = db.query.nodes.findFirst().sync()
    const attrs = db.query.nodeAttributes
      .findMany({ where: eq(nodeAttributes.nodeId, node?.id ?? "") })
      .sync()
    expect(attrs).toHaveLength(2)
    expect(warnSpy).toHaveBeenCalledWith(
      "Skipping duplicate node attributes",
      expect.objectContaining({ provider: "mal", externalId: "1", dropped: 1 }),
    )

    warnSpy.mockRestore()
  })

  it("syncs Steam idempotently and preserves manual status overrides", async () => {
    process.env.STEAM_API_KEY = "test-steam-key"
    resetEnvCache()

    configureSteamAccount({
      steamId: "76561198000000000",
      enabled: false,
      userId: null,
    })

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("GetOwnedGames")) {
        return jsonResponse({
          response: {
            games: [
              {
                appid: 10,
                name: "Hades",
                playtime_forever: 60,
              },
            ],
          },
        })
      }

      if (url.includes("IWishlistService/GetWishlist")) {
        return jsonResponse({
          response: {
            items: [{ appid: 20, priority: 1, date_added: 1_700_000_000 }],
          },
        })
      }

      if (url.includes("IStoreBrowseService/GetItems")) {
        return jsonResponse({
          response: {
            store_items: [
              {
                appid: 20,
                name: "Slay the Princess",
                release: { steam_release_date: 1_698_451_200 },
              },
            ],
          },
        })
      }

      if (url.includes("steam/apps/10") || url.includes("steam/apps/20")) {
        return imageResponse()
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    const firstRun = await runSteamSync()
    expect(firstRun.status).toBe("success")
    expect(listNodes({ showHidden: true, showNsfw: true }).total).toBe(2)

    const hades = listNodes({ q: "Hades", showHidden: true, showNsfw: true }).items[0]
    expect(hades?.status).toBe("IN_PROGRESS")

    await saveManualNode(
      {
        id: hades?.id,
        displayName: "Hades",
        mediaType: "GAME",
        status: "COMPLETED",
        description: "",
        releaseYear: undefined,
        nsfw: false,
        hidden: false,
        notes: undefined,
        removeImage: false,
        attributes: [],
        storageLocations: [],
        links: [],
      },
      null,
    )

    const secondRun = await runSteamSync()
    expect(secondRun.status).toBe("success")

    const updated = hades?.id ? getNodeById(hades.id) : null
    expect(updated?.status).toBe("COMPLETED")
    expect(db.query.externalRefs.findMany({ where: eq(externalRefs.provider, "steam") }).sync()).toHaveLength(2)

    fetchSpy.mockRestore()
  })

  it("records safe response diagnostics when Steam returns HTML for the wishlist", async () => {
    process.env.STEAM_API_KEY = "test-steam-key"
    resetEnvCache()

    configureSteamAccount({
      steamId: "76561198000000000",
      enabled: true,
      userId: null,
    })

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("GetOwnedGames")) {
        return jsonResponse({
          response: {
            games: [{ appid: 30, name: "Celeste", playtime_forever: 0 }],
          },
        })
      }

      if (url.includes("IWishlistService/GetWishlist")) {
        return new Response(
          "<!DOCTYPE html><html><head><title>Sign In</title></head><body>Steam login required</body></html>",
          {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          },
        )
      }

      if (url.includes("steam/apps/30")) {
        return imageResponse()
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    const result = await runSteamSync()
    expect(result.status).toBe("partial")
    expect(result.warnings[0]).toContain("Wishlist response was not valid JSON")
    expect(result.warnings[0]).toContain("status=200")
    expect(result.warnings[0]).toContain("content-type=text/html")
    expect(result.warnings[0]).toContain("body-preview=Sign In Steam login required")
    expect(result.warnings[0]).not.toContain("<!DOCTYPE")
    expect(listNodes({ showHidden: true, showNsfw: true }).total).toBe(1)

    fetchSpy.mockRestore()
  })

  it("preserves owned games and explains an inaccessible Steam wishlist", async () => {
    process.env.STEAM_API_KEY = "test-steam-key"
    resetEnvCache()

    configureSteamAccount({
      steamId: "76561198000000000",
      enabled: true,
      userId: null,
    })

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("GetOwnedGames")) {
        return jsonResponse({
          response: {
            games: [{ appid: 40, name: "Portal", playtime_forever: 10 }],
          },
        })
      }

      if (url.includes("IWishlistService/GetWishlist")) {
        expect(url).toContain("key=test-steam-key")
        return jsonResponse({ response: {} })
      }

      if (url.includes("steam/apps/40")) {
        return imageResponse()
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    const result = await runSteamSync()
    expect(result.status).toBe("partial")
    expect(result.warnings[0]).toContain("set Profile and Game details visibility to Public")
    expect(listNodes({ showHidden: true, showNsfw: true }).total).toBe(1)

    fetchSpy.mockRestore()
  })

  it("imports a private wishlist through an encrypted share URL fallback", async () => {
    process.env.STEAM_API_KEY = "test-steam-key"
    resetEnvCache()

    configureSteamAccount({
      steamId: "76561198000000000",
      wishlistShareUrl:
        "https://store.steampowered.com/wishlist/profiles/76561198000000000/?token=secret",
      enabled: false,
      userId: null,
    })

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("GetOwnedGames")) {
        return jsonResponse({ response: { games: [] } })
      }

      if (url.includes("IWishlistService/GetWishlist")) {
        return jsonResponse({ response: {} })
      }

      if (url.includes("store.steampowered.com/wishlist/")) {
        return new Response(
          '<html><body><a href="https://store.steampowered.com/app/50/">Game</a></body></html>',
          { headers: { "Content-Type": "text/html" } },
        )
      }

      if (url.includes("IStoreBrowseService/GetItems")) {
        return jsonResponse({
          response: {
            store_items: [{ appid: 50, name: "Half-Life" }],
          },
        })
      }

      if (url.includes("steam/apps/50")) {
        return imageResponse()
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    const result = await runSteamSync()
    expect(result.status).toBe("success")
    expect(listNodes({ showHidden: true, showNsfw: true }).items[0]?.displayName).toBe(
      "Half-Life",
    )

    fetchSpy.mockRestore()
  })
})
