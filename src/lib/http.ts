import "@/lib/server-only"

import { getEnv } from "@/lib/env"

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
) {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(new Error("Request timed out")),
    init.timeoutMs ?? getEnv().remoteHttpTimeoutMs,
  )

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
) {
  const response = await fetchWithTimeout(input, init)
  const text = await response.text()

  if (!response.ok) {
    throw new Error(
      `Request failed (${response.status} ${response.statusText}): ${text.slice(0, 500)}`,
    )
  }

  return text ? (JSON.parse(text) as T) : ({} as T)
}
