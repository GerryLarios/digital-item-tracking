import "@/lib/server-only"

import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { externalRefs, nodes } from "@/lib/db/schema"
import { mergeNodes } from "@/lib/library/service"
import { searchRawgGameByTitle } from "@/lib/providers/rawg"
import { searchSteamAppByTitle } from "@/lib/providers/steam"
import { fetchDetails } from "@/lib/sync/item-details"
import { reconcileRemoteItem } from "@/lib/sync/service"

export type GameMatch = {
  provider: "steam" | "rawg"
  externalId: string
}

export async function findGameMatch(
  title: string,
): Promise<GameMatch | null> {
  console.info("Provider match lookup started", { title })
  const warnings: string[] = []
  const steamId = await searchSteamAppByTitle(title).catch((error) => {
    warnings.push(`Steam search failed: ${error instanceof Error ? error.message : String(error)}`)
    return null
  })
  if (steamId) {
    console.info("Provider match found", { title, provider: "steam", externalId: steamId })
    return { provider: "steam", externalId: steamId }
  }
  if (!warnings.length) {
    console.info("Steam: no exact match", { title })
  }

  try {
    const rawgMatch = await searchRawgGameByTitle(title)
    if (rawgMatch) {
      console.info("Provider match found", {
        title,
        provider: "rawg",
        externalId: String(rawgMatch.id),
      })
      return { provider: "rawg", externalId: String(rawgMatch.id) }
    }
    console.info("RAWG: no exact match", { title })
  } catch (error) {
    warnings.push(`RAWG search failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  console.warn("No provider exact match", { title, warnings })
  return null
}

export async function applyProviderMatch(nodeId: string, match: GameMatch) {
  const conflictingRef = db.query.externalRefs.findFirst({
    where: and(
      eq(externalRefs.provider, match.provider),
      eq(externalRefs.externalId, match.externalId),
    ),
  }).sync()
  if (conflictingRef && conflictingRef.nodeId !== nodeId) {
    console.info("Provider match already on another entry; merging instead of duplicating.", {
      nodeId,
      otherNodeId: conflictingRef.nodeId,
      provider: match.provider,
      externalId: match.externalId,
    })
    mergeNodes(nodeId, conflictingRef.nodeId)
    return match
  }

  const item = await fetchDetails(match.provider, match.externalId, ["manual"])
  const reconciled = await reconcileRemoteItem(item, [])

  if (reconciled.nodeId !== nodeId) {
    console.info("Provider details landed on a new entry; attaching them instead of duplicating.", {
      nodeId,
      reconciledNodeId: reconciled.nodeId,
      provider: match.provider,
      externalId: match.externalId,
    })
    mergeNodes(nodeId, reconciled.nodeId)
  }

  return match
}

export async function enrichGameNode(nodeId: string): Promise<GameMatch | null> {
  const node = db.query.nodes.findFirst({ where: eq(nodes.id, nodeId) }).sync()
  if (!node) {
    throw new Error("Item not found.")
  }
  if (node.mediaType !== "GAME") {
    throw new Error("Provider lookup is only available for games.")
  }

  const match = await findGameMatch(node.displayName)

  return match ? applyProviderMatch(nodeId, match) : null
}
