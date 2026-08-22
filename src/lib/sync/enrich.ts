import "@/lib/server-only"

import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { externalRefs, nodes } from "@/lib/db/schema"
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
  const warnings: string[] = []
  const steamId = await searchSteamAppByTitle(title).catch((error) => {
    warnings.push(`Steam search failed: ${error instanceof Error ? error.message : String(error)}`)
    return null
  })
  if (steamId) {
    return { provider: "steam", externalId: steamId }
  }

  try {
    const rawgMatch = await searchRawgGameByTitle(title)
    if (rawgMatch) {
      return { provider: "rawg", externalId: String(rawgMatch.id) }
    }
  } catch (error) {
    warnings.push(`RAWG search failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (warnings.length) {
    console.warn("Provider lookup warnings", { title, warnings })
  }

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
    throw new Error(
      `This game already exists as "${conflictingRef.provider}/${match.externalId}" on another entry.`,
    )
  }

  const item = await fetchDetails(match.provider, match.externalId, ["manual"])
  await reconcileRemoteItem(item, [])

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
