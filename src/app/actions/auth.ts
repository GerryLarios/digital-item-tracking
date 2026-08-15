"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth, getRequestIp, hasAnyUsers, isInitialSetupOpen } from "@/lib/auth"
import { clearAuthFailures, assertWithinRateLimit, RateLimitError, recordAuthFailure } from "@/lib/rate-limit"
import { flattenZodErrors, loginSchema, setupSchema, type FormState } from "@/lib/validation"

function buildRateLimitKey(email: string, ipAddress: string) {
  return `auth:${email.toLowerCase()}:${ipAddress}`
}

export async function setupAction(_previousState: FormState, formData: FormData): Promise<FormState> {
  if (!isInitialSetupOpen()) {
    return { message: "Initial setup is already complete." }
  }

  const parsed = setupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  })

  if (!parsed.success) {
    return {
      message: "Check the highlighted fields and try again.",
      errors: flattenZodErrors(parsed.error),
    }
  }

  const requestHeaders = await headers()
  const rateLimitKey = buildRateLimitKey(parsed.data.email, getRequestIp(requestHeaders))

  try {
    assertWithinRateLimit(rateLimitKey)
    await auth.api.signUpEmail({
      headers: requestHeaders,
      body: parsed.data,
    })
    clearAuthFailures(rateLimitKey)
  } catch (error) {
    recordAuthFailure(rateLimitKey)

    if (error instanceof RateLimitError) {
      return { message: error.message }
    }

    return { message: "Unable to create the initial account." }
  }

  redirect("/library")
}

export async function loginAction(_previousState: FormState, formData: FormData): Promise<FormState> {
  if (!hasAnyUsers()) {
    redirect("/setup")
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })

  if (!parsed.success) {
    return {
      message: "Enter your email address and password.",
      errors: flattenZodErrors(parsed.error),
    }
  }

  const requestHeaders = await headers()
  const rateLimitKey = buildRateLimitKey(parsed.data.email, getRequestIp(requestHeaders))

  try {
    assertWithinRateLimit(rateLimitKey)
    await auth.api.signInEmail({
      headers: requestHeaders,
      body: parsed.data,
    })
    clearAuthFailures(rateLimitKey)
  } catch (error) {
    recordAuthFailure(rateLimitKey)

    if (error instanceof RateLimitError) {
      return { message: error.message }
    }

    return { message: "Invalid email or password." }
  }

  redirect("/library")
}

export async function logoutAction() {
  await auth.api.signOut({
    headers: await headers(),
  })

  redirect("/login")
}
