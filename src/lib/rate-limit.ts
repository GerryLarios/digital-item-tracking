import "@/lib/server-only"

import { eq } from "drizzle-orm"

import {
  LOGIN_RATE_LIMIT_BLOCK_MS,
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  LOGIN_RATE_LIMIT_WINDOW_MS,
} from "@/lib/constants"
import { db } from "@/lib/db/client"
import { authRateLimits } from "@/lib/db/schema"

export class RateLimitError extends Error {
  constructor(message: string, readonly retryAt: Date) {
    super(message)
  }
}

function now() {
  return new Date()
}

export function assertWithinRateLimit(key: string) {
  const current = now()
  const existing = db.query.authRateLimits.findFirst({ where: eq(authRateLimits.key, key) }).sync()

  if (!existing) {
    return
  }

  if (existing.blockedUntil && existing.blockedUntil > current) {
    throw new RateLimitError("Too many attempts. Try again later.", existing.blockedUntil)
  }

  if (current.getTime() - existing.windowStartedAt.getTime() > LOGIN_RATE_LIMIT_WINDOW_MS) {
    db
      .update(authRateLimits)
      .set({
        count: 0,
        blockedUntil: null,
        windowStartedAt: current,
        updatedAt: current,
      })
      .where(eq(authRateLimits.key, key))
      .run()
  }
}

export function recordAuthFailure(key: string) {
  const current = now()
  const existing = db.query.authRateLimits.findFirst({ where: eq(authRateLimits.key, key) }).sync()

  if (!existing) {
    db.insert(authRateLimits).values({
      key,
      count: 1,
      windowStartedAt: current,
      createdAt: current,
      updatedAt: current,
    }).run()
    return
  }

  const sameWindow = current.getTime() - existing.windowStartedAt.getTime() <= LOGIN_RATE_LIMIT_WINDOW_MS
  const nextCount = sameWindow ? existing.count + 1 : 1
  const blockedUntil =
    nextCount >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS
      ? new Date(current.getTime() + LOGIN_RATE_LIMIT_BLOCK_MS)
      : null

  db
    .update(authRateLimits)
    .set({
      count: nextCount,
      blockedUntil,
      windowStartedAt: sameWindow ? existing.windowStartedAt : current,
      updatedAt: current,
    })
    .where(eq(authRateLimits.key, key))
    .run()
}

export function clearAuthFailures(key: string) {
  db.delete(authRateLimits).where(eq(authRateLimits.key, key)).run()
}
