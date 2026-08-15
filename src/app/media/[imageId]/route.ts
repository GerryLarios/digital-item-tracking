import fs from "node:fs"
import { Readable } from "node:stream"

import { getSessionFromHeaders } from "@/lib/auth"
import { getImageById, getManagedAbsolutePath } from "@/lib/storage/images"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ imageId: string }> },
) {
  const session = await getSessionFromHeaders(request.headers)
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { imageId } = await context.params
  const image = getImageById(imageId)
  if (!image) {
    return new Response("Not found", { status: 404 })
  }

  const absolutePath = getManagedAbsolutePath(image.path)
  if (!fs.existsSync(absolutePath)) {
    return new Response("Not found", { status: 404 })
  }

  const stream = fs.createReadStream(absolutePath)

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "private, max-age=60",
    },
  })
}
