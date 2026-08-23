import { NextResponse } from "next/server"

import { getSessionFromHeaders } from "@/lib/auth"
import { getEnv } from "@/lib/env"
import {
  getMalImportFailures,
  retryMalImportFailures,
} from "@/lib/library/mal-import"

import { failureListHtml, progressLine, progressPageResponse } from "../progress-page"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const session = await getSessionFromHeaders(request.headers)
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url), 303)
  }

  if (request.headers.get("origin") !== getEnv().appOrigin) {
    return new Response("Invalid origin", { status: 403 })
  }

  if (!getMalImportFailures().length) {
    return NextResponse.redirect(new URL("/library", request.url), 303)
  }

  return progressPageResponse(async (send) => {
    const result = await retryMalImportFailures((progress) => {
      send(progressLine(progress))
    })
    send(
      `<h1>Retry complete</h1><p>${result.total} attempted &mdash; ${result.created} created, ${result.merged} merged, ${result.failed} still failing.</p>`,
    )
    send(failureListHtml(getMalImportFailures()))
  })
}
