import "@/lib/server-only"

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { and, eq, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { db } from "@/lib/db/client"
import { accounts, sessions, users, verifications } from "@/lib/db/schema"
import { getEnv } from "@/lib/env"

const env = getEnv()

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  baseURL: env.appOrigin,
  secret: env.betterAuthSecret,
  trustedOrigins: [env.appOrigin],
  emailAndPassword: {
    enabled: true,
  },
  plugins: [nextCookies()],
})

export async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  })
}

export async function getSessionFromHeaders(requestHeaders: Headers) {
  return auth.api.getSession({
    headers: requestHeaders,
  })
}

export async function requireSession() {
  const session = await getSession()
  if (!session?.user) {
    redirect("/login")
  }

  return session
}

export async function requireSessionFromHeaders(requestHeaders: Headers) {
  const session = await getSessionFromHeaders(requestHeaders)
  if (!session?.user) {
    throw new Error("Unauthorized")
  }

  return session
}

export function getRequestIp(requestHeaders: Headers) {
  const forwardedFor = requestHeaders.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "local"
  }

  return requestHeaders.get("x-real-ip") ?? "local"
}

export function getRequestUserAgent(requestHeaders: Headers) {
  return requestHeaders.get("user-agent") ?? "unknown"
}

export function hasAnyUsers() {
  const row = db.select({ count: sql<number>`count(*)` }).from(users).get()
  return (row?.count ?? 0) > 0
}

export function getPrimaryUserId() {
  const row = db.select({ id: users.id }).from(users).limit(1).get()
  return row?.id ?? null
}

export function getUserByEmail(email: string) {
  return db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) }).sync()
}

export function isInitialSetupOpen() {
  return !hasAnyUsers()
}

export function isValidSessionToken(token: string) {
  return db.query.sessions.findFirst({
    where: and(eq(sessions.token, token), sql`${sessions.expiresAt} > ${new Date()}`),
  }).sync()
}
