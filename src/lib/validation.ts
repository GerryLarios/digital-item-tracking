import { z } from "zod"

import {
  ATTRIBUTE_VALUE_TYPES,
  COLLECTION_MEMBERSHIPS,
  MEDIA_TYPES,
  NODE_STATUSES,
  PROVIDERS,
  STORAGE_MEDIA,
} from "@/lib/constants"

const optionalTrimmedString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim()
    return trimmed ? trimmed : undefined
  })

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address.").trim(),
  password: z.string().min(8, "Enter your password."),
})

export const setupSchema = loginSchema.extend({
  name: z.string().trim().min(2, "Use at least 2 characters for the name."),
})

export const nodeAttributeInputSchema = z.object({
  key: z.string().trim().min(1, "Attribute keys are required."),
  value: z.string().trim().min(1, "Attribute values are required."),
  valueType: z.enum(ATTRIBUTE_VALUE_TYPES).default("text"),
})

export const storageLocationInputSchema = z.object({
  label: z.string().trim().min(1, "A location label is required."),
  medium: z.enum(STORAGE_MEDIA).default("physical"),
  platform: optionalTrimmedString,
  notes: optionalTrimmedString,
})

export const nodeLinkInputSchema = z.object({
  label: z.string().trim().min(1, "A link label is required."),
  url: z.string().url("Enter a valid URL.").trim(),
})

export const nodeFormSchema = z.object({
  id: optionalTrimmedString,
  displayName: z.string().trim().min(1, "A title is required."),
  mediaType: z.enum(MEDIA_TYPES),
  status: z.enum(NODE_STATUSES),
  description: optionalTrimmedString,
  releaseYear: z
    .union([z.string(), z.number(), z.undefined(), z.null()])
    .transform((value) => {
      if (value == null || value === "") return undefined
      const parsed = typeof value === "number" ? value : Number.parseInt(value, 10)
      return Number.isFinite(parsed) ? parsed : Number.NaN
    })
    .refine(
      (value) => value == null || (Number.isInteger(value) && value >= 1900 && value <= 2100),
      "Release year must be between 1900 and 2100.",
    )
    .optional(),
  nsfw: z.boolean().default(false),
  hidden: z.boolean().default(false),
  notes: optionalTrimmedString,
  removeImage: z.boolean().default(false),
  attributes: z.array(nodeAttributeInputSchema).default([]),
  storageLocations: z.array(storageLocationInputSchema).default([]),
  links: z.array(nodeLinkInputSchema).default([]),
})

export const manualExternalRefSchema = z.object({
  provider: z.enum(PROVIDERS),
  externalId: z.string().trim().min(1, "An external ID is required."),
  externalUrl: z.string().url("Enter a valid provider URL.").trim().optional(),
})

export const librarySearchSchema = z.object({
  q: optionalTrimmedString,
  mediaType: z.enum(MEDIA_TYPES).optional(),
  status: z.enum(NODE_STATUSES).optional(),
  provider: z.enum(PROVIDERS).optional(),
  collection: z.enum(COLLECTION_MEMBERSHIPS).optional(),
  medium: z.enum(STORAGE_MEDIA).optional(),
  view: z.enum(["grid", "list"]).default("grid"),
  page: z.coerce.number().int().min(1).default(1),
  showHidden: z
    .union([z.string(), z.boolean(), z.undefined()])
    .transform((value) => value === true || value === "true" || value === "on")
    .default(false),
  showNsfw: z
    .union([z.string(), z.boolean(), z.undefined()])
    .transform((value) => value === true || value === "true" || value === "on")
    .default(false),
})

export const steamConfigSchema = z.object({
  steamId: z
    .string()
    .trim()
    .regex(/^\d{17}$/, "SteamID64 must be 17 digits.")
    .optional()
    .or(z.literal("")),
  wishlistShareUrl: z
    .string()
    .trim()
    .refine((value) => {
      if (!value) return true
      try {
        const url = new URL(value)
        return (
          url.protocol === "https:" &&
          url.hostname === "store.steampowered.com" &&
          url.pathname.startsWith("/wishlist/")
        )
      } catch {
        return false
      }
    }, "Enter an HTTPS Steam wishlist share URL.")
    .optional()
    .or(z.literal("")),
})

export type LoginInput = z.infer<typeof loginSchema>
export type SetupInput = z.infer<typeof setupSchema>
export type NodeFormInput = z.infer<typeof nodeFormSchema>
export type NodeEditorInput = Omit<NodeFormInput, "releaseYear"> & {
  releaseYear?: string
}
export type NodeAttributeInput = z.infer<typeof nodeAttributeInputSchema>
export type StorageLocationInput = z.infer<typeof storageLocationInputSchema>
export type NodeLinkInput = z.infer<typeof nodeLinkInputSchema>
export type LibrarySearchInput = z.infer<typeof librarySearchSchema>

export type FormState = {
  message?: string
  errors?: Record<string, string[]>
}

export const EMPTY_FORM_STATE: FormState = {}

export function flattenZodErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[]>
}

export function parseJsonArrayField<T>(
  value: FormDataEntryValue | null,
  schema: z.ZodType<T>,
  fallback: T,
) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback
  }

  const raw = JSON.parse(value)
  return schema.parse(raw)
}
