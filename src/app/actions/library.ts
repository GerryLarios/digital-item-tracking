"use server"

import { redirect } from "next/navigation"

import { requireSession } from "@/lib/auth"
import { PROVIDER_LABELS } from "@/lib/constants"
import { deleteNode, mergeNodes, saveManualNode } from "@/lib/library/service"
import { enrichGameNode } from "@/lib/sync/enrich"
import { syncNodeDetails } from "@/lib/sync/item-details"
import {
  flattenZodErrors,
  nodeAttributeInputSchema,
  nodeFormSchema,
  nodeLinkInputSchema,
  parseJsonArrayField,
  storageLocationInputSchema,
  type FormState,
} from "@/lib/validation"

export async function saveNodeAction(_previousState: FormState, formData: FormData): Promise<FormState> {
  await requireSession()

  let nodeId: string

  try {
    const parsed = nodeFormSchema.safeParse({
      id: formData.get("id"),
      displayName: formData.get("displayName"),
      mediaType: formData.get("mediaType"),
      status: formData.get("status"),
      description: formData.get("description"),
      releaseYear: formData.get("releaseYear"),
      nsfw: formData.get("nsfw") === "on",
      hidden: formData.get("hidden") === "on",
      notes: formData.get("notes"),
      removeImage: formData.get("removeImage") === "on",
      attributes: parseJsonArrayField(
        formData.get("attributesJson"),
        nodeAttributeInputSchema.array(),
        [],
      ),
      storageLocations: parseJsonArrayField(
        formData.get("storageLocationsJson"),
        storageLocationInputSchema.array(),
        [],
      ),
      links: parseJsonArrayField(formData.get("linksJson"), nodeLinkInputSchema.array(), []),
    })

    if (!parsed.success) {
      return {
        message: "Check the form and try again.",
        errors: flattenZodErrors(parsed.error),
      }
    }

    const imageValue = formData.get("image")
    const image = imageValue instanceof File && imageValue.size > 0 ? imageValue : null
    nodeId = await saveManualNode(parsed.data, image)
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : "Unable to save this item.",
    }
  }

  redirect(`/library/${nodeId}`)
}

export async function deleteNodeAction(formData: FormData) {
  await requireSession()

  const nodeId = formData.get("nodeId")
  const confirmed = formData.get("confirmed")

  if (typeof nodeId !== "string" || !nodeId) {
    redirect("/library")
  }

  if (confirmed !== "true") {
    redirect(`/library/${nodeId}?error=confirm-delete`)
  }

  deleteNode(nodeId)
  redirect("/library?deleted=1")
}

const NODE_ID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/

export async function mergeNodesAction(formData: FormData) {
  await requireSession()

  const targetId = formData.get("targetId")
  if (typeof targetId !== "string" || !targetId) {
    redirect("/library")
  }

  const rawSource = formData.get("source")
  const confirmed = formData.get("confirmed")
  if (typeof rawSource !== "string" || !rawSource.trim()) {
    redirect(`/library/${targetId}?syncError=${encodeURIComponent("Paste the other item's URL or ID to merge.")}`)
  }
  if (confirmed !== "true") {
    redirect(`/library/${targetId}?syncError=${encodeURIComponent("Confirm the merge to continue.")}`)
  }

  const sourceMatch = rawSource.match(NODE_ID_PATTERN)
  if (!sourceMatch) {
    redirect(`/library/${targetId}?syncError=${encodeURIComponent("Could not find an item ID in that value.")}`)
  }

  let destination: string
  try {
    mergeNodes(targetId, sourceMatch[0])
    destination = `/library/${targetId}?sync=${encodeURIComponent("Items merged; provider references combined.")}`
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to merge these items."
    destination = `/library/${targetId}?syncError=${encodeURIComponent(message)}`
  }

  redirect(destination)
}

export async function syncNodeDetailsAction(formData: FormData) {
  await requireSession()

  const nodeId = formData.get("nodeId")
  if (typeof nodeId !== "string" || !nodeId) {
    redirect("/library")
  }

  let destination: string
  try {
    const result = await syncNodeDetails(nodeId)
    const message = result.failures.length
      ? `Updated ${result.updated.join(", ")}. ${result.failures.join(" ")}`
      : `Updated details from ${result.updated.join(" and ")}.`
    destination = `/library/${nodeId}?sync=${encodeURIComponent(message)}`
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sync item details."
    destination = `/library/${nodeId}?syncError=${encodeURIComponent(message)}`
  }

  redirect(destination)
}

export async function findProviderMatchAction(formData: FormData) {
  await requireSession()

  const nodeId = formData.get("nodeId")
  if (typeof nodeId !== "string" || !nodeId) {
    redirect("/library")
  }

  let destination: string
  try {
    const match = await enrichGameNode(nodeId)
    const message = match
      ? `Exact match found on ${PROVIDER_LABELS[match.provider]} (${match.provider}/${match.externalId}); details updated.`
      : "No exact provider match found for this title."
    destination = `/library/${nodeId}?sync=${encodeURIComponent(message)}`
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to look up this item."
    destination = `/library/${nodeId}?syncError=${encodeURIComponent(message)}`
  }

  redirect(destination)
}
