import fs from "node:fs"
import path from "node:path"

import sharp from "sharp"
import { describe, expect, it } from "vitest"

import { getDataPaths } from "@/lib/data-dir"
import { getNodeById, saveManualNode } from "@/lib/library/service"
import { setManualMainImage } from "@/lib/storage/images"

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

describe("image storage", () => {
  it("stores normalized originals and thumbnails", async () => {
    const nodeId = await saveManualNode(
      {
        id: undefined,
        displayName: "Artwork test",
        mediaType: "GAME",
        status: "NOT_STARTED",
        description: undefined,
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

    await setManualMainImage(
      nodeId,
      new File([PNG_BUFFER], "pixel.png", { type: "image/png" }),
    )

    const node = getNodeById(nodeId)
    expect(node?.images).toHaveLength(2)
    expect(node?.images.some((image) => fs.existsSync(path.join(getDataPaths().root, image.path)))).toBe(true)
  })

  it("rejects invalid image payloads", async () => {
    const nodeId = await saveManualNode(
      {
        id: undefined,
        displayName: "Broken artwork",
        mediaType: "GAME",
        status: "NOT_STARTED",
        description: undefined,
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

    await expect(
      setManualMainImage(nodeId, new File([Buffer.from("not-an-image")], "bad.png", { type: "image/png" })),
    ).rejects.toThrow(/Unsupported image/i)
  })
})
