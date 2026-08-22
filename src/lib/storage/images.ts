import "@/lib/server-only"

import fs from "node:fs"
import path from "node:path"

import { and, eq, inArray } from "drizzle-orm"
import sharp from "sharp"

import { createId } from "@/lib/helpers"
import type { Provider } from "@/lib/constants"
import { checksumBuffer } from "@/lib/crypto"
import { ensureDataDirectories, getDataPaths, resolveManagedPath, toManagedRelativePath } from "@/lib/data-dir"
import { db } from "@/lib/db/client"
import { images } from "@/lib/db/schema"
import { getEnv } from "@/lib/env"
import { fetchWithTimeout } from "@/lib/http"

const SUPPORTED_OUTPUTS = new Set(["jpeg", "png", "webp", "avif"])
type SupportedFormat = "jpeg" | "png" | "webp" | "avif"
const MIME_BY_FORMAT: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
}

export type StoredImageSet = {
  assetKey: string
  originalImageId: string
  thumbnailImageId: string
}

async function readUploadedFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.byteLength > getEnv().imageMaxUploadBytes) {
    throw new Error(`Images must be smaller than ${Math.floor(getEnv().imageMaxUploadBytes / 1024 / 1024)}MB.`)
  }

  return buffer
}

function normalizeFormat(input: string | undefined): SupportedFormat {
  if (!input) return "webp"
  return SUPPORTED_OUTPUTS.has(input) ? (input as SupportedFormat) : "webp"
}

function getExtensionForFormat(format: string) {
  return format === "jpeg" ? "jpg" : format
}

async function normalizeImageBuffer(buffer: Buffer) {
  const metadata = await sharp(buffer, { failOn: "error" }).metadata()

  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error("Unsupported image. Upload a decodable PNG, JPEG, WebP, or AVIF file.")
  }

  const format = normalizeFormat(metadata.format)
  const original = await sharp(buffer, { failOn: "error" }).rotate().toFormat(format).toBuffer()
  const thumbnail = await sharp(original)
    .resize({
      width: 480,
      height: 480,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer()

  const thumbMetadata = await sharp(thumbnail).metadata()

  return {
    original,
    thumbnail,
    format,
    width: metadata.width,
    height: metadata.height,
    thumbWidth: thumbMetadata.width ?? Math.min(metadata.width, 480),
    thumbHeight: thumbMetadata.height ?? Math.min(metadata.height, 480),
    mimeType: MIME_BY_FORMAT[format] ?? "image/webp",
  }
}

function writeFileAtomically(targetPath: string, buffer: Buffer) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })

  if (fs.existsSync(targetPath)) {
    return
  }

  const tempPath = `${targetPath}.tmp-${createId()}`
  fs.writeFileSync(tempPath, buffer)
  fs.renameSync(tempPath, targetPath)
}

function removeFileIfPresent(targetPath: string) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath)
  }
}

function removeDatabaseImageRecords(imageIds: string[]) {
  if (!imageIds.length) return [] as string[]

  const existing = db.query.images.findMany({
    where: inArray(images.id, imageIds),
  }).sync()

  db.delete(images).where(inArray(images.id, imageIds)).run()
  return existing.map((image) => image.path)
}

function cleanupOrphanedPaths(relativePaths: string[]) {
  const uniquePaths = [...new Set(relativePaths)]

  for (const relativePath of uniquePaths) {
    const stillReferenced = db.query.images.findFirst({ where: eq(images.path, relativePath) }).sync()
    if (!stillReferenced) {
      removeFileIfPresent(resolveManagedPath(relativePath))
    }
  }
}

function getCurrentPrimaryImages(nodeId: string) {
  return db.query.images.findMany({
    where: and(eq(images.nodeId, nodeId), inArray(images.role, ["main", "thumbnail"])),
  }).sync()
}

async function persistImageSet({
  nodeId,
  originalBuffer,
  thumbnailBuffer,
  format,
  mimeType,
  width,
  height,
  thumbWidth,
  thumbHeight,
  sourceUrl,
  sourceProvider,
  managed,
}: {
  nodeId: string
  originalBuffer: Buffer
  thumbnailBuffer: Buffer
  format: string
  mimeType: string
  width: number
  height: number
  thumbWidth: number
  thumbHeight: number
  sourceUrl?: string | null
  sourceProvider?: Provider | null
  managed: boolean
}) {
  ensureDataDirectories()

  const assetKey = createId()
  const originalChecksum = checksumBuffer(originalBuffer)
  const thumbnailChecksum = checksumBuffer(thumbnailBuffer)
  const originalRelativePath = path.join(
    "media",
    "originals",
    `${originalChecksum}.${getExtensionForFormat(format)}`,
  )
  const thumbnailRelativePath = path.join("media", "thumbnails", `${thumbnailChecksum}.webp`)

  writeFileAtomically(resolveManagedPath(originalRelativePath), originalBuffer)
  writeFileAtomically(resolveManagedPath(thumbnailRelativePath), thumbnailBuffer)

  const now = new Date()
  const currentPrimary = getCurrentPrimaryImages(nodeId)
  const orphanCandidates = removeDatabaseImageRecords(currentPrimary.map((image) => image.id))

  const originalImageId = createId()
  const thumbnailImageId = createId()

  db.insert(images)
    .values([
      {
        id: originalImageId,
        assetKey,
        nodeId,
        role: "main",
        path: originalRelativePath,
        mimeType,
        width,
        height,
        byteSize: originalBuffer.byteLength,
        checksum: originalChecksum,
        sourceUrl: sourceUrl ?? null,
        sourceProvider: sourceProvider ?? null,
        sortOrder: 0,
        managed,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: thumbnailImageId,
        assetKey,
        nodeId,
        role: "thumbnail",
        path: thumbnailRelativePath,
        mimeType: "image/webp",
        width: thumbWidth,
        height: thumbHeight,
        byteSize: thumbnailBuffer.byteLength,
        checksum: thumbnailChecksum,
        sourceUrl: sourceUrl ?? null,
        sourceProvider: sourceProvider ?? null,
        sortOrder: 0,
        managed,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run()

  cleanupOrphanedPaths(orphanCandidates)

  return {
    assetKey,
    originalImageId,
    thumbnailImageId,
  } satisfies StoredImageSet
}

export async function setManualMainImage(nodeId: string, file: File) {
  const buffer = await readUploadedFile(file)
  const normalized = await normalizeImageBuffer(buffer)

  return persistImageSet({
    nodeId,
    originalBuffer: normalized.original,
    thumbnailBuffer: normalized.thumbnail,
    format: normalized.format,
    mimeType: normalized.mimeType,
    width: normalized.width,
    height: normalized.height,
    thumbWidth: normalized.thumbWidth,
    thumbHeight: normalized.thumbHeight,
    managed: false,
  })
}

export async function removePrimaryImageSet(nodeId: string) {
  const existing = getCurrentPrimaryImages(nodeId)
  const paths = removeDatabaseImageRecords(existing.map((image) => image.id))
  cleanupOrphanedPaths(paths)
}

export async function syncManagedMainImage(
  nodeId: string,
  provider: Provider,
  sourceUrl: string,
) {
  const response = await fetchWithTimeout(sourceUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.1",
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to download artwork (${response.status}).`)
  }

  const contentLength = Number.parseInt(response.headers.get("content-length") ?? "0", 10)
  if (contentLength && contentLength > getEnv().remoteImageMaxBytes) {
    throw new Error("Remote artwork exceeded the configured size limit.")
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength > getEnv().remoteImageMaxBytes) {
    throw new Error("Remote artwork exceeded the configured size limit.")
  }

  const normalized = await normalizeImageBuffer(buffer)

  return persistImageSet({
    nodeId,
    originalBuffer: normalized.original,
    thumbnailBuffer: normalized.thumbnail,
    format: normalized.format,
    mimeType: normalized.mimeType,
    width: normalized.width,
    height: normalized.height,
    thumbWidth: normalized.thumbWidth,
    thumbHeight: normalized.thumbHeight,
    sourceUrl,
    sourceProvider: provider,
    managed: true,
  })
}

export function getImageById(imageId: string) {
  return db.query.images.findFirst({ where: eq(images.id, imageId) }).sync()
}

export function readImageFile(relativePath: string) {
  return fs.readFileSync(resolveManagedPath(relativePath))
}

export function deleteAllNodeImages(nodeId: string) {
  const existing = db.query.images.findMany({ where: eq(images.nodeId, nodeId) }).sync()
  const paths = removeDatabaseImageRecords(existing.map((image) => image.id))
  cleanupOrphanedPaths(paths)
}

export function getNodeImageUrls(nodeId: string) {
  const rows = db.query.images.findMany({ where: eq(images.nodeId, nodeId) }).sync()
  const main = rows.find((row) => row.role === "main")
  const thumbnail = rows.find((row) => row.role === "thumbnail")

  return {
    mainImageId: main?.id ?? null,
    thumbnailImageId: thumbnail?.id ?? null,
  }
}

export function getManagedAbsolutePath(relativePath: string) {
  return resolveManagedPath(relativePath)
}

export function getManagedRelativePath(absolutePath: string) {
  return toManagedRelativePath(absolutePath)
}

export function ensureStorageRoot() {
  return getDataPaths()
}
