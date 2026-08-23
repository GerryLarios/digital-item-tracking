import { randomUUID } from "node:crypto"

export function createId() {
  return randomUUID()
}

export function compact<T>(values: Array<T | null | undefined | false | "">): T[] {
  return values.filter(Boolean) as T[]
}

export function emptyToNull(value: string | null | undefined) {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

export function parseOptionalInt(value: string | null | undefined) {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseBoolean(value: FormDataEntryValue | null | undefined) {
  return value === "on" || value === "true" || value === "1"
}

export function uniqueValues<T>(values: T[]) {
  return [...new Set(values)]
}

export function parseJson<T>(input: string | null | undefined, fallback: T): T {
  if (!input) return fallback

  try {
    return JSON.parse(input) as T
  } catch {
    return fallback
  }
}

export function safeJsonStringify(value: unknown) {
  return JSON.stringify(value ?? null)
}

export function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export function getBaseUrlPathname(url: string | null | undefined) {
  if (!url) return null

  try {
    return new URL(url).pathname
  } catch {
    return null
  }
}

export function formatDate(value: Date | null | undefined) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)
}

export function formatDateOnly(value: Date | null | undefined) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(value)
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function buildQueryString(
  params: Record<string, string | number | boolean | undefined>,
) {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue
    searchParams.set(key, String(value))
  }
  return searchParams.toString()
}

export function prettyJson(value: string | null | undefined) {
  if (!value) return null
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}
