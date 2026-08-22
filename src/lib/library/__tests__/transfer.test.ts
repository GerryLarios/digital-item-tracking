import { eq, sql } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/lib/db/client"
import {
  externalRefs,
  images,
  nodeAttributes,
  nodeLinks,
  nodes,
  storageLocations,
} from "@/lib/db/schema"
import { createId, parseJson } from "@/lib/helpers"
import { exportLibrary, importLibrary } from "@/lib/library/transfer"

vi.mock("@/lib/sync/enrich", () => ({
  findGameMatch: vi.fn(),
  applyProviderMatch: vi.fn(),
}))

import {
  applyProviderMatch,
  findGameMatch,
} from "@/lib/sync/enrich"

const mockedFindGameMatch = vi.mocked(findGameMatch)
const mockedApplyProviderMatch = vi.mocked(applyProviderMatch)

function seedAggregate(id = createId(), externalId = "100") {
  const createdAt = new Date("2025-01-01T00:00:00.000Z")
  const updatedAt = new Date("2025-02-01T00:00:00.000Z")

  db.insert(nodes).values({
    id,
    mediaType: "GAME",
    displayName: "Exported game",
    description: "Description",
    status: "IN_PROGRESS",
    releaseYear: 2025,
    nsfw: true,
    hidden: true,
    notes: "Notes",
    overrideFields: JSON.stringify(["displayName"]),
    createdAt,
    updatedAt,
  }).run()
  db.insert(nodeAttributes).values({
    id: createId(),
    nodeId: id,
    key: "genre",
    value: "Action",
    valueType: "text",
    source: "steam",
    sourceProvider: "steam",
    lastSeenAt: updatedAt,
    createdAt,
    updatedAt,
  }).run()
  db.insert(storageLocations).values({
    id: createId(),
    nodeId: id,
    label: "Steam",
    medium: "digital",
    platform: "PC",
    notes: "Owned",
    source: "steam",
    sourceProvider: "steam",
    isActive: true,
    lastSeenAt: updatedAt,
    createdAt,
    updatedAt,
  }).run()
  db.insert(externalRefs).values({
    id: createId(),
    nodeId: id,
    provider: "steam",
    externalId,
    externalUrl: `https://store.steampowered.com/app/${externalId}`,
    mediaType: "GAME",
    listMemberships: JSON.stringify(["wishlist"]),
    remoteStatus: "available",
    lastSeenAt: updatedAt,
    isActive: true,
    sourceData: JSON.stringify({ conflict: "imported", remote: true }),
    createdAt,
    updatedAt,
  }).run()
  db.insert(nodeLinks).values({
    id: createId(),
    nodeId: id,
    label: "Store",
    url: `https://store.steampowered.com/app/${externalId}`,
    createdAt,
    updatedAt,
  }).run()
  db.insert(images).values({
    id: createId(),
    assetKey: createId(),
    nodeId: id,
    role: "main",
    path: "media/originals/missing.webp",
    mimeType: "image/webp",
    width: 600,
    height: 900,
    byteSize: 1234,
    checksum: "checksum",
    sourceUrl: "https://cdn.example.test/image.webp",
    sourceProvider: "steam",
    managed: true,
    createdAt,
    updatedAt,
  }).run()

  return id
}

describe("library JSON transfer", () => {
  beforeEach(() => {
    mockedFindGameMatch.mockReset()
    mockedApplyProviderMatch.mockReset()
  })

  it("round-trips all non-binary item relationships", async () => {
    const nodeId = seedAggregate()
    const archive = exportLibrary()

    expect(archive.itemCount).toBe(1)
    expect(archive.items[0].externalRefs[0].sourceData).toEqual({
      conflict: "imported",
      remote: true,
    })
    expect(archive.items[0].images[0].sourceUrl).toContain("cdn.example.test")

    db.delete(nodes).where(eq(nodes.id, nodeId)).run()
    const result = await importLibrary(archive)

    expect(result).toEqual({
      created: 1,
      merged: 0,
      artworkSkipped: 1,
      enriched: 0,
      unmatched: 0,
      failedEnrichments: 0,
    })
    expect(db.select().from(nodes).get()).toMatchObject({
      id: nodeId,
      displayName: "Exported game",
      status: "IN_PROGRESS",
      nsfw: true,
      hidden: true,
    })
    expect(db.select().from(nodeAttributes).all()).toHaveLength(1)
    expect(db.select().from(storageLocations).all()).toHaveLength(1)
    expect(db.select().from(externalRefs).all()).toHaveLength(1)
    expect(db.select().from(nodeLinks).all()).toHaveLength(1)
    expect(db.select().from(images).all()).toHaveLength(0)
  })

  it("overwrites core fields and merges relationships without duplicates", async () => {
    const nodeId = seedAggregate()
    const archive = exportLibrary()
    const item = archive.items[0]
    item.displayName = "Imported title"
    item.attributes.push({
      ...item.attributes[0],
      value: "Adventure",
    })
    item.links[0].label = "Imported store label"
    item.links.push({ ...item.links[0], label: "Final imported label" })
    item.externalRefs[0].listMemberships = ["wishlist"]
    item.externalRefs[0].sourceData = {
      conflict: "imported",
      remote: true,
    }

    const ref = db.select().from(externalRefs)
      .where(eq(externalRefs.nodeId, nodeId)).get()!
    db.update(externalRefs).set({
      listMemberships: JSON.stringify(["owned"]),
      sourceData: JSON.stringify({ conflict: "current", local: true }),
    }).where(eq(externalRefs.id, ref.id)).run()

    const result = await importLibrary(archive)

    expect(result).toMatchObject({ created: 0, merged: 1 })
    expect(db.select().from(nodes).where(eq(nodes.id, nodeId)).get()?.displayName)
      .toBe("Imported title")
    expect(db.select({ count: sql<number>`count(*)` }).from(nodeAttributes).get()?.count)
      .toBe(2)
    expect(db.select({ count: sql<number>`count(*)` }).from(storageLocations).get()?.count)
      .toBe(1)
    expect(db.select({ count: sql<number>`count(*)` }).from(nodeLinks).get()?.count)
      .toBe(1)
    expect(db.select().from(nodeLinks).get()?.label).toBe("Final imported label")

    const mergedRef = db.select().from(externalRefs).get()!
    expect(parseJson<string[]>(mergedRef.listMemberships, [])).toEqual(["owned", "wishlist"])
    expect(parseJson(mergedRef.sourceData, {})).toEqual({
      conflict: "imported",
      local: true,
      remote: true,
    })
  })

  it("rejects conflicting and archive-internal identities before writes", async () => {
    const firstId = seedAggregate(createId(), "300")
    const secondId = seedAggregate(createId(), "301")
    const archive = exportLibrary()
    const first = archive.items.find((item) => item.id === firstId)!
    first.externalRefs[0].externalId = "301"
    archive.items = [first]
    archive.itemCount = 1

    await expect(importLibrary(archive)).rejects.toThrow("resolve to different items")
    expect(db.select().from(nodes).where(eq(nodes.id, firstId)).get()?.displayName)
      .toBe("Exported game")

    const internallyDuplicated = exportLibrary()
    internallyDuplicated.items[1].id = internallyDuplicated.items[0].id
    await expect(importLibrary(internallyDuplicated)).rejects.toThrow()
    expect(db.select().from(nodes).where(eq(nodes.id, secondId)).get()).toBeDefined()
  })

  it("rejects unsupported archive versions", async () => {
    await expect(importLibrary({
      format: "registered-backlog-items",
      version: 2,
      exportedAt: new Date().toISOString(),
      itemCount: 0,
      items: [],
    })).rejects.toThrow()
    expect(db.select().from(nodes).all()).toHaveLength(0)
  })

  it("imports hand-authored lists and enriches bare game entries", async () => {
    mockedFindGameMatch.mockResolvedValue({ provider: "rawg", externalId: "42" })
    mockedApplyProviderMatch.mockResolvedValue({ provider: "rawg", externalId: "42" })

    const result = await importLibrary([
      { displayName: "Bare Game" },
      { displayName: "Rich Book", mediaType: "BOOK", description: "Already has metadata" },
    ])

    expect(result).toEqual({
      created: 2,
      merged: 0,
      artworkSkipped: 0,
      enriched: 1,
      unmatched: 0,
      failedEnrichments: 0,
    })
    const createdNodes = db.select().from(nodes).all()
    expect(createdNodes).toHaveLength(2)
    expect(createdNodes.find((node) => node.displayName === "Bare Game")).toMatchObject({
      mediaType: "GAME",
      status: "NOT_STARTED",
      description: null,
    })
    expect(mockedApplyProviderMatch).toHaveBeenCalledTimes(1)
  })

  it("uses the steamAppId hint without searching and counts misses", async () => {
    mockedFindGameMatch.mockResolvedValue(null)

    const result = await importLibrary({
      items: [
        { displayName: "Known AppId", steamAppId: 570 },
        { displayName: "Unknown Game" },
      ],
    })

    expect(result).toMatchObject({ created: 2, enriched: 1, unmatched: 1 })
    expect(mockedFindGameMatch).toHaveBeenCalledTimes(1)
    expect(mockedFindGameMatch).toHaveBeenCalledWith("Unknown Game")
    expect(mockedApplyProviderMatch).toHaveBeenCalledWith(
      expect.any(String),
      { provider: "steam", externalId: "570" },
    )
    const ref = db.select().from(externalRefs).get()!
    expect(ref).toMatchObject({ provider: "steam", externalId: "570" })
    expect(parseJson<string[]>(ref.listMemberships, [])).toEqual(["manual"])
  })
})