import { describe, expect, it } from "vitest"

import { db } from "@/lib/db/client"
import { externalRefs, nodes } from "@/lib/db/schema"
import { createId } from "@/lib/helpers"
import { deleteNode, getNodeById, listNodes, saveManualNode } from "@/lib/library/service"

describe("library service", () => {
  it("creates, filters, updates, and deletes a manual node", async () => {
    const nodeId = await saveManualNode(
      {
        id: undefined,
        displayName: "Persona 5 Royal",
        mediaType: "GAME",
        status: "NOT_STARTED",
        description: "Stylish RPG",
        releaseYear: 2020,
        nsfw: false,
        hidden: false,
        notes: "Play on Steam Deck.",
        removeImage: false,
        attributes: [{ key: "genre", value: "JRPG", valueType: "text" }],
        storageLocations: [{ label: "Shelf A", medium: "physical", platform: "PS5", notes: "Steelbook" }],
        links: [{ label: "Official site", url: "https://persona.atlus.com" }],
      },
      null,
    )

    const created = getNodeById(nodeId)
    expect(created?.displayName).toBe("Persona 5 Royal")
    expect(created?.attributes).toHaveLength(1)
    expect(created?.storageLocations).toHaveLength(1)
    expect(created?.links).toHaveLength(1)

    const searchResults = listNodes({ q: "Persona" })
    expect(searchResults.total).toBe(1)
    expect(searchResults.items[0]?.id).toBe(nodeId)

    await saveManualNode(
      {
        id: nodeId,
        displayName: "Persona 5 Royal",
        mediaType: "GAME",
        status: "COMPLETED",
        description: "Stylish RPG",
        releaseYear: 2020,
        nsfw: false,
        hidden: true,
        notes: "Finished.",
        removeImage: false,
        attributes: [],
        storageLocations: [],
        links: [],
      },
      null,
    )

    const updated = getNodeById(nodeId)
    expect(updated?.status).toBe("COMPLETED")
    expect(updated?.hidden).toBe(true)
    expect(listNodes({ q: "Persona" }).total).toBe(0)
    expect(listNodes({ q: "Persona", showHidden: true }).total).toBe(1)

    deleteNode(nodeId)
    expect(getNodeById(nodeId)).toBeNull()
  })

  it("filters active provider references by exact collection membership", () => {
    const now = new Date()
    const wishlistNodeId = createId()
    const ownedNodeId = createId()

    db.insert(nodes)
      .values([
        {
          id: wishlistNodeId,
          mediaType: "GAME",
          displayName: "Wishlisted game",
          status: "NOT_STARTED",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: ownedNodeId,
          mediaType: "GAME",
          displayName: "Owned game",
          status: "NOT_STARTED",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run()

    db.insert(externalRefs)
      .values([
        {
          id: createId(),
          nodeId: wishlistNodeId,
          provider: "steam",
          externalId: "10",
          listMemberships: JSON.stringify(["wishlist"]),
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: createId(),
          nodeId: ownedNodeId,
          provider: "steam",
          externalId: "20",
          listMemberships: JSON.stringify(["owned"]),
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run()

    const result = listNodes({ provider: "steam", collection: "wishlist" })
    expect(result.total).toBe(1)
    expect(result.items[0]?.id).toBe(wishlistNodeId)
  })
})
