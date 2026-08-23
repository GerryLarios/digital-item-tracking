import { NextResponse } from "next/server"

import { getSessionFromHeaders } from "@/lib/auth"
import { getEnv } from "@/lib/env"
import { getMalImportFailures, importMalXml } from "@/lib/library/mal-import"

import { failureListHtml, progressLine, progressPageResponse } from "./progress-page"

export const runtime = "nodejs"

const MAX_IMPORT_BYTES = 20 * 1024 * 1024

function libraryRedirect(request: Request, values: Record<string, string | number>) {
  const url = new URL("/settings/integrations/import/mal", request.url)
  for (const [key, value] of Object.entries(values)) {
    url.searchParams.set(key, String(value))
  }
  return NextResponse.redirect(url, 303)
}

export async function POST(request: Request) {
  const session = await getSessionFromHeaders(request.headers)
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url), 303)
  }

  if (request.headers.get("origin") !== getEnv().appOrigin) {
    return new Response("Invalid origin", { status: 403 })
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > MAX_IMPORT_BYTES + 1024 * 1024) {
    return libraryRedirect(request, { importError: "The XML file exceeds 20 MB." })
  }

  const formData = await request.formData()
  const file = formData.get("file")
  if (!(file instanceof File) || !file.size) {
    return libraryRedirect(request, { importError: "Choose a MyAnimeList XML export to import." })
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return libraryRedirect(request, { importError: "The XML file exceeds 20 MB." })
  }

  const xmlText = await file.text()

  return progressPageResponse(async (send) => {
    const result = await importMalXml(xmlText, (progress) => {
      send(progressLine(progress))
    })
    send(
      `<h1>Import complete</h1><p>${result.created} created, ${result.merged} merged, ${result.skipped} skipped, ${result.failed} failed.</p>`,
    )
    if (result.failed) {
      send(
        `<p>Failed entries were saved &mdash; retry them later with &ldquo;Retry MyAnimeList failures&rdquo; in the library.</p>`,
      )
      send(failureListHtml(getMalImportFailures()))
    }
  })
}
