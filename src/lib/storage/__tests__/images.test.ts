import fs from "node:fs"
import path from "node:path"

import sharp from "sharp"
import { afterEach, describe, expect, it, vi } from "vitest"

import { getDataPaths } from "@/lib/data-dir"
import { resetEnvCache } from "@/lib/env"
import { getNodeById, saveManualNode } from "@/lib/library/service"
import {
  setManualMainImage,
  syncManagedGalleryImages,
  syncManagedMainImage,
} from "@/lib/storage/images"

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
  afterEach(() => {
    vi.unstubAllEnvs()
    resetEnvCache()
  })

  it("skips oversized remote artwork instead of failing the sync", async () => {
    vi.stubEnv("REMOTE_IMAGE_MAX_BYTES", "1024")
    resetEnvCache()

    const nodeId = await saveManualNode(
      {
        id: undefined,
        displayName: "Oversized art",
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

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () => {
      return new Response("", {
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": "2048",
        },
      })
    })

    await expect(
      syncManagedMainImage(nodeId, "rawg", "https://media.example.test/big.jpg"),
    ).resolves.toBeUndefined()
    expect(getNodeById(nodeId)?.images).toHaveLength(0)

    fetchSpy.mockRestore()
  })

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

  it("replaces gallery images per provider", async () => {
    const nodeId = await saveManualNode(
      {
        id: undefined,
        displayName: "Gallery test",
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

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () => {
      return new Response(PNG_BUFFER, {
        headers: {
          "Content-Type": "image/png",
          "Content-Length": String(PNG_BUFFER.byteLength),
        },
      })
    })

    await syncManagedGalleryImages(nodeId, "rawg", [
      { sourceUrl: "https://media.example.test/a.jpg", width: 1920, height: 1080 },
      { sourceUrl: "https://media.example.test/b.jpg", width: 1280, height: 720 },
    ])
    const first = getNodeById(nodeId)
    expect(first?.images.filter((image) => image.role === "gallery")).toHaveLength(4)

    await syncManagedGalleryImages(nodeId, "rawg", [
      { sourceUrl: "https://media.example.test/c.jpg", width: 1600, height: 900 },
    ])
    const second = getNodeById(nodeId)
    const gallery = second?.images.filter((image) => image.role === "gallery") ?? []
    expect(gallery).toHaveLength(2)
    expect(gallery.every((image) => image.sourceUrl === "https://media.example.test/c.jpg")).toBe(true)

    fetchSpy.mockRestore()
  })
})
