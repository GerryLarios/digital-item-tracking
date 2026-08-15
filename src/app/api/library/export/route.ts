import { NextResponse } from "next/server"

import { getSessionFromHeaders } from "@/lib/auth"
import { exportLibrary } from "@/lib/library/transfer"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const session = await getSessionFromHeaders(request.headers)
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const archive = exportLibrary()
  const date = archive.exportedAt.slice(0, 10)

  return new Response(JSON.stringify(archive, null, 2), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="registered-backlog-items-${date}.json"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  })
}
