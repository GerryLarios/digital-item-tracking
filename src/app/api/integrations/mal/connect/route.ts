import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { getSessionFromHeaders } from "@/lib/auth"
import { createPkceVerifier } from "@/lib/crypto"
import { createId } from "@/lib/helpers"
import { buildMalAuthorizationUrl } from "@/lib/providers/mal"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const session = await getSessionFromHeaders(request.headers)
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const state = createId()
  const verifier = createPkceVerifier()
  const cookieStore = await cookies()

  cookieStore.set("mal_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  })
  cookieStore.set("mal_oauth_verifier", verifier, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  })

  return NextResponse.redirect(buildMalAuthorizationUrl({ state, codeChallenge: verifier }))
}
