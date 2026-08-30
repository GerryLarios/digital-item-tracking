import { eq } from "drizzle-orm"
import { describe, expect, it, vi } from "vitest"

import { db } from "@/lib/db/client"
import { externalRefs, nodes } from "@/lib/db/schema"
import { createId } from "@/lib/helpers"
import { applyProviderMatch } from "@/lib/sync/enrich"

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  })
}

describe("applyProviderMatch", () => {
  it("attaches the match to the existing item instead of creating a duplicate", async () => {
    const nodeId = createId()
    db.insert(nodes)
      .values({
        id: nodeId,
        mediaType: "GAME",
        displayName: "Local game",
        status: "NOT_STARTED",
        overrideFields: "[]",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run()

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/appdetails")) {
        return jsonResponse({
          100: {
            success: true,
            data: { type: "game", name: "Remote game", steam_appid: 100 },
          },
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    await applyProviderMatch(nodeId, { provider: "steam", externalId: "100" })

    expect(db.select().from(nodes).all()).toHaveLength(1)
    const refs = db.select().from(externalRefs).where(eq(externalRefs.nodeId, nodeId)).all()
    expect(refs).toHaveLength(1)
    expect(refs[0].provider).toBe("steam")
    expect(refs[0].externalId).toBe("100")

    fetchSpy.mockRestore()
  })

  it("merges an existing match from another entry instead of throwing", async () => {
    const otherId = createId()
    const nodeId = createId()
    const now = new Date()
    for (const id of [nodeId, otherId]) {
      db.insert(nodes)
        .values({
          id,
          mediaType: "GAME",
          displayName: `Game ${id}`,
          status: "NOT_STARTED",
          overrideFields: "[]",
          createdAt: now,
          updatedAt: now,
        })
        .run()
    }
    db.insert(externalRefs)
      .values({
        id: createId(),
        nodeId: otherId,
        provider: "steam",
        externalId: "100",
        mediaType: "GAME",
        listMemberships: JSON.stringify(["manual"]),
        isActive: true,
        sourceData: "{}",
        createdAt: now,
        updatedAt: now,
      })
      .run()

    await applyProviderMatch(nodeId, { provider: "steam", externalId: "100" })

    expect(db.select().from(nodes).where(eq(nodes.id, otherId)).all()).toHaveLength(0)
    const refs = db.select().from(externalRefs).where(eq(externalRefs.nodeId, nodeId)).all()
    expect(refs).toHaveLength(1)
    expect(refs[0].externalId).toBe("100")
  })
})