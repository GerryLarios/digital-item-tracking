import { NextResponse } from "next/server"
import { ZodError } from "zod"

import { getSessionFromHeaders } from "@/lib/auth"
import { getEnv } from "@/lib/env"
import { importLibrary } from "@/lib/library/transfer"

export const runtime = "nodejs"

const MAX_IMPORT_BYTES = 100 * 1024 * 1024

function libraryRedirect(request: Request, values: Record<string, string | number>) {
  const url = new URL("/settings/integrations/import/json", request.url)
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
    return libraryRedirect(request, { importError: "The JSON file exceeds 100 MB." })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File) || !file.size) {
      return libraryRedirect(request, { importError: "Choose a JSON export to import." })
    }
    if (file.size > MAX_IMPORT_BYTES) {
      return libraryRedirect(request, { importError: "The JSON file exceeds 100 MB." })
    }

    const parsed = JSON.parse(await file.text()) as unknown
    const result = await importLibrary(parsed)

    return libraryRedirect(request, {
      importCreated: result.created,
      importMerged: result.merged,
      artworkSkipped: result.artworkSkipped,
      importEnriched: result.enriched,
      importUnmatched: result.unmatched,
      ...(result.failedEnrichments
        ? { importEnrichFailed: result.failedEnrichments }
        : {}),
    })
  } catch (error) {
    const isIdentityConflict =
      error instanceof Error && error.message.startsWith("Imported identities")
    if (!(error instanceof SyntaxError) && !(error instanceof ZodError) && !isIdentityConflict) {
      console.error("Library import failed", error)
    }
    const message =
      error instanceof SyntaxError
        ? "The selected file is not valid JSON."
        : isIdentityConflict
          ? error.message
          : "The selected file is not a valid library export or item list."
    return libraryRedirect(request, { importError: message })
  }
}
