import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { db } from "@/lib/db/client"
import {
  externalRefs,
  images,
  nodeAttributes,
  nodeLinks,
  nodes,
  storageLocations,
} from "@/lib/db/schema"
import { createId } from "@/lib/helpers"
import { mergeNodes } from "@/lib/library/service"

function seedNode(id: string, provider: "steam" | "rawg", externalId: string) {
  const now = new Date()
  db.insert(nodes)
    .values({
      id,
      mediaType: "GAME",
      displayName: `Game ${provider}`,
      status: "NOT_STARTED",
      overrideFields: JSON.stringify([]),
      createdAt: now,
      updatedAt: now,
    })
    .run()
  db.insert(externalRefs)
    .values({
      id: createId(),
      nodeId: id,
      provider,
      externalId,
      mediaType: "GAME",
      listMemberships: JSON.stringify(["manual"]),
      isActive: true,
      sourceData: "{}",
      createdAt: now,
      updatedAt: now,
    })
    .run()
  db.insert(nodeAttributes)
    .values({
      id: createId(),
      nodeId: id,
      key: "developer",
      value: `Dev ${provider}`,
      valueType: "text",
      source: provider,
      sourceProvider: provider,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  db.insert(storageLocations)
    .values({
      id: createId(),
      nodeId: id,
      label: `Loc ${provider}`,
      medium: "digital",
      platform: "PC",
      source: provider,
      sourceProvider: provider,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  db.insert(nodeLinks)
    .values({
      id: createId(),
      nodeId: id,
      label: `Link ${provider}`,
      url: `https://example.test/${provider}`,
      createdAt: now,
      updatedAt: now,
    })
    .run()
}

describe("mergeNodes", () => {
  it("combines provider refs and child rows into the target", () => {
    const targetId = createId()
    const sourceId = createId()
    seedNode(targetId, "steam", "100")
    seedNode(sourceId, "rawg", "200")
    db.insert(images)
      .values({
        id: createId(),
        assetKey: createId(),
        nodeId: sourceId,
        role: "main",
        path: "media/originals/a.webp",
        mimeType: "image/webp",
        width: 1,
        height: 1,
        byteSize: 1,
        checksum: "c1",
        managed: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run()

    mergeNodes(targetId, sourceId)

    expect(db.select().from(nodes).where(eq(nodes.id, sourceId)).all()).toHaveLength(0)
    expect(db.select().from(externalRefs).where(eq(externalRefs.nodeId, targetId)).all()).toHaveLength(2)
    const movedImages = db.select().from(images).where(eq(images.nodeId, targetId)).all()
    expect(movedImages).toHaveLength(1)
    expect(movedImages[0].role).toBe("main")
    expect(db.select().from(nodeAttributes).where(eq(nodeAttributes.nodeId, targetId)).all()).toHaveLength(2)
    expect(db.select().from(storageLocations).where(eq(storageLocations.nodeId, targetId)).all()).toHaveLength(2)
    expect(db.select().from(nodeLinks).where(eq(nodeLinks.nodeId, targetId)).all()).toHaveLength(2)
  })

  it("keeps the target main image and demotes a source main to gallery", () => {
    const targetId = createId()
    const sourceId = createId()
    seedNode(targetId, "steam", "100")
    seedNode(sourceId, "rawg", "200")
    const now = new Date()
    db.insert(images)
      .values({
        id: createId(),
        assetKey: "t1",
        nodeId: targetId,
        role: "main",
        path: "media/originals/t.webp",
        mimeType: "image/webp",
        width: 1,
        height: 1,
        byteSize: 1,
        checksum: "tc",
        managed: true,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    db.insert(images)
      .values([
        {
          id: createId(),
          assetKey: "s1",
          nodeId: sourceId,
          role: "main",
          path: "media/originals/s.webp",
          mimeType: "image/webp",
          width: 1,
          height: 1,
          byteSize: 1,
          checksum: "sc",
          managed: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: createId(),
          assetKey: "s1",
          nodeId: sourceId,
          role: "thumbnail",
          path: "media/thumbnails/s.webp",
          mimeType: "image/webp",
          width: 1,
          height: 1,
          byteSize: 1,
          checksum: "st",
          managed: true,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run()

    mergeNodes(targetId, sourceId)

    const rows = db.select().from(images).where(eq(images.nodeId, targetId)).orderBy(images.path).all()
    expect(rows).toHaveLength(2)
    expect(rows.some((image) => image.role === "main" && image.path.endsWith("/t.webp"))).toBe(true)
    expect(rows.some((image) => image.role === "gallery" && image.path.endsWith("/s.webp"))).toBe(true)
  })

  it("rejects merging into itself", () => {
    const nodeId = createId()
    seedNode(nodeId, "steam", "100")
    expect(() => mergeNodes(nodeId, nodeId)).toThrow(/into itself/)
  })
})