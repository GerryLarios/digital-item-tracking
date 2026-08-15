import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { getSessionFromHeaders } from "@/lib/auth"
import { upsertSyncAccount } from "@/lib/integrations/service"
import { exchangeMalAuthorizationCode, fetchMalProfile } from "@/lib/providers/mal"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const session = await getSessionFromHeaders(request.headers)
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const cookieStore = await cookies()
  const expectedState = cookieStore.get("mal_oauth_state")?.value
  const verifier = cookieStore.get("mal_oauth_verifier")?.value

  const redirectTarget = new URL("/settings/integrations", request.url)

  if (error) {
    redirectTarget.searchParams.set("error", error)
    return NextResponse.redirect(redirectTarget)
  }

  if (!code || !state || !expectedState || !verifier || expectedState != state) {
    redirectTarget.searchParams.set("error", "invalid-mal-state")
    return NextResponse.redirect(redirectTarget)
  }

  try {
    const token = await exchangeMalAuthorizationCode(code, verifier)
    const provisionalAccount = upsertSyncAccount("mal", {
      enabled: true,
      userId: session.user.id,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
    })

    const profile = provisionalAccount ? await fetchMalProfile(provisionalAccount) : undefined

    upsertSyncAccount("mal", {
      enabled: true,
      userId: session.user.id,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
      displayName: profile?.name ?? provisionalAccount?.displayName ?? null,
      externalAccountId: profile?.id ? String(profile.id) : provisionalAccount?.externalAccountId ?? null,
      profile: profile ? JSON.parse(JSON.stringify(profile)) : provisionalAccount?.profile ?? {},
    })

    redirectTarget.searchParams.set("connected", "mal")
  } catch (callbackError) {
    redirectTarget.searchParams.set(
      "error",
      callbackError instanceof Error ? callbackError.message : "mal-callback-failed",
    )
  } finally {
    cookieStore.delete("mal_oauth_state")
    cookieStore.delete("mal_oauth_verifier")
  }

  return NextResponse.redirect(redirectTarget)
}
