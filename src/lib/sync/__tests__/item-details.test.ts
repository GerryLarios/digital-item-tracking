import { eq } from "drizzle-orm"
import sharp from "sharp"
import { describe, expect, it, vi } from "vitest"

import { db } from "@/lib/db/client"
import { externalRefs, nodes } from "@/lib/db/schema"
import { createId, parseJson } from "@/lib/helpers"
import { upsertSyncAccount } from "@/lib/integrations/service"
import { getNodeById } from "@/lib/library/service"
import { syncNodeDetails } from "@/lib/sync/item-details"

const IMAGE = await sharp({
  create: {
    width: 8,
    height: 8,
    channels: 4,
    background: { r: 25, g: 50, b: 75, alpha: 1 },
  },
})
  .png()
  .toBuffer()

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  })
}

function imageResponse() {
  return new Response(IMAGE, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(IMAGE.byteLength),
    },
  })
}

function insertProviderNode({
  provider,
  externalId,
  memberships,
  overrideFields = [],
}: {
  provider: "steam" | "mal"
  externalId: string
  memberships: string[]
  overrideFields?: string[]
}) {
  const now = new Date()
  const nodeId = createId()
  db.insert(nodes)
    .values({
      id: nodeId,
      mediaType: provider === "steam" ? "GAME" : "ANIME",
      displayName: "Local title",
      status: "NOT_STARTED",
      overrideFields: JSON.stringify(overrideFields),
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
      listMemberships: JSON.stringify(memberships),
      isActive: true,
      sourceData: JSON.stringify({ existing: true }),
      createdAt: now,
      updatedAt: now,
    })
    .run()
  return nodeId
}

describe("per-item detail sync", () => {
  it("maps Steam details, detects adult content, and preserves local overrides", async () => {
    const nodeId = insertProviderNode({
      provider: "steam",
      externalId: "100",
      memberships: ["wishlist"],
      overrideFields: ["displayName"],
    })

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/appdetails")) {
        return jsonResponse({
          100: {
            success: true,
            data: {
              type: "game",
              name: "Remote title",
              steam_appid: 100,
              short_description: "Remote description",
              header_image: "https://cdn.example.test/steam.png",
              developers: ["Studio"],
              publishers: ["Publisher"],
              genres: [{ id: "1", description: "Action" }],
              categories: [{ id: 1, description: "Single-player" }],
              content_descriptors: { ids: [3], notes: "Sexual Content" },
              release_date: { coming_soon: false, date: "10 Oct, 2024" },
              platforms: { windows: true, mac: false, linux: true },
              recommendations: { total: 42 },
              custom_raw_field: { retained: true },
            },
          },
        })
      }
      if (url === "https://cdn.example.test/steam.png") return imageResponse()
      throw new Error(`Unexpected fetch: ${url}`)
    })

    await syncNodeDetails(nodeId)

    const node = getNodeById(nodeId)
    expect(node?.displayName).toBe("Local title")
    expect(node?.description).toBe("Remote description")
    expect(node?.releaseYear).toBe(2024)
    expect(node?.nsfw).toBe(true)
    expect(node?.images.some((image) => image.role === "main")).toBe(true)
    expect(node?.attributes.some((attribute) => attribute.key === "developer" && attribute.value === "Studio")).toBe(true)

    const ref = db.query.externalRefs.findFirst({ where: eq(externalRefs.nodeId, nodeId) }).sync()
    expect(parseJson<string[]>(ref?.listMemberships ?? "[]", [])).toEqual(["wishlist"])
    const sourceData = parseJson<Record<string, unknown>>(ref?.sourceData ?? "{}", {})
    expect(sourceData.existing).toBe(true)
    expect(JSON.stringify(sourceData.details)).toContain("custom_raw_field")

    fetchSpy.mockRestore()
  })

  it("keeps the raw Steam payload when detail parsing fails", async () => {
    const nodeId = insertProviderNode({
      provider: "steam",
      externalId: "999",
      memberships: ["owned"],
    })
    const rawResponse = {
      999: {
        success: true,
        data: { name: "Broken", content_descriptors: { ids: "oops" } },
      },
    }

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/appdetails")) return jsonResponse(rawResponse)
      throw new Error(`Unexpected fetch: ${url}`)
    })

    await expect(syncNodeDetails(nodeId)).rejects.toMatchObject({
      name: "ProviderParseError",
      response: rawResponse,
    })

    fetchSpy.mockRestore()
  })

  it("accepts a null content descriptor note from Steam", async () => {
    const nodeId = insertProviderNode({
      provider: "steam",
      externalId: "150",
      memberships: ["owned"],
    })

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/appdetails")) {
        return jsonResponse({
          150: {
            success: true,
            data: {
              name: "Null notes game",
              steam_appid: 150,
              content_descriptors: { ids: [], notes: null },
            },
          },
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    await syncNodeDetails(nodeId)
    expect(getNodeById(nodeId)?.displayName).toBe("Null notes game")
    expect(getNodeById(nodeId)?.nsfw).toBe(false)

    fetchSpy.mockRestore()
  })

  it("maps comprehensive MAL details and retains the raw payload", async () => {
    const nodeId = insertProviderNode({
      provider: "mal",
      externalId: "200",
      memberships: ["list", "favorite"],
    })
    upsertSyncAccount("mal", {
      accessToken: "mal-token",
      refreshToken: "refresh",
      accessTokenExpiresAt: new Date(Date.now() + 10 * 60_000),
    })

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes("/anime/200")) {
        expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer mal-token")
        return jsonResponse({
          id: 200,
          title: "Remote anime",
          synopsis: "Anime description",
          nsfw: "gray",
          start_date: "2022-01-01",
          mean: 8.5,
          num_episodes: 12,
          genres: [{ name: "Fantasy" }],
          studios: [{ name: "Madhouse" }],
          main_picture: { large: "https://cdn.example.test/mal.png" },
          custom_raw_field: ["retained"],
        })
      }
      if (url === "https://cdn.example.test/mal.png") return imageResponse()
      throw new Error(`Unexpected fetch: ${url}`)
    })

    await syncNodeDetails(nodeId)

    const node = getNodeById(nodeId)
    expect(node?.displayName).toBe("Remote anime")
    expect(node?.description).toBe("Anime description")
    expect(node?.releaseYear).toBe(2022)
    expect(node?.nsfw).toBe(true)
    expect(node?.attributes.some((attribute) => attribute.key === "episodes" && attribute.value === "12")).toBe(true)
    expect(node?.attributes.some((attribute) => attribute.key === "score" && attribute.value === "8.5")).toBe(true)

    const ref = db.query.externalRefs.findFirst({ where: eq(externalRefs.nodeId, nodeId) }).sync()
    expect(parseJson<string[]>(ref?.listMemberships ?? "[]", [])).toEqual(["list", "favorite"])
    expect(JSON.stringify(parseJson(ref?.sourceData ?? "{}", {}))).toContain("custom_raw_field")

    fetchSpy.mockRestore()
  })

  it("keeps a successful provider update when another provider fails", async () => {
    const nodeId = insertProviderNode({
      provider: "steam",
      externalId: "300",
      memberships: ["owned"],
    })
    const now = new Date()
    db.insert(externalRefs)
      .values({
        id: createId(),
        nodeId,
        provider: "mal",
        externalId: "301",
        listMemberships: JSON.stringify(["list"]),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/appdetails")) {
        return jsonResponse({
          300: {
            success: true,
            data: {
              name: "Updated by Steam",
              steam_appid: 300,
              genres: [],
              categories: [],
            },
          },
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    const result = await syncNodeDetails(nodeId)
    expect(result.updated).toEqual(["steam"])
    expect(result.failures[0]).toContain("MAL")
    expect(getNodeById(nodeId)?.displayName).toBe("Updated by Steam")

    fetchSpy.mockRestore()
  })
})
