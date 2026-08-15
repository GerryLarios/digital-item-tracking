import "@/lib/server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

import { getEnv } from "@/lib/env"

const IV_BYTES = 12

function getKeyBuffer() {
  return createHash("sha256").update(getEnv().encryptionKey).digest()
}

export function checksumBuffer(input: Buffer) {
  return createHash("sha256").update(input).digest("hex")
}

export function encryptSecret(value: string | null | undefined) {
  if (!value) return null

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv("aes-256-gcm", getKeyBuffer(), iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".")
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return null

  const [ivPart, tagPart, encryptedPart] = value.split(".")
  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error("Invalid encrypted secret format.")
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKeyBuffer(),
    Buffer.from(ivPart, "base64url"),
  )
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"))

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

export function base64UrlEncode(input: Buffer | string) {
  return Buffer.from(input).toString("base64url")
}

export function createPkceVerifier() {
  return base64UrlEncode(randomBytes(48))
}

export function createPkceChallenge(verifier: string) {
  return base64UrlEncode(createHash("sha256").update(verifier).digest())
}
