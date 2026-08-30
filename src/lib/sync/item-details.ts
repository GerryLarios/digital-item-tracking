import "@/lib/server-only"

import { and, eq } from "drizzle-orm"

import type { Provider } from "@/lib/constants"
import { db } from "@/lib/db/client"
import { externalRefs, nodes } from "@/lib/db/schema"
import { parseJson } from "@/lib/helpers"
import { getSyncAccount } from "@/lib/integrations/service"
import { fetchMalItemDetails } from "@/lib/providers/mal"
import {
  fetchRawgGameScreenshots,
  fetchRawgItemDetails,
} from "@/lib/providers/rawg"
import { fetchSteamItemDetails } from "@/lib/providers/steam"
import { ProviderParseError, type RemoteCatalogItem } from "@/lib/providers/types"
import { syncManagedGalleryImages } from "@/lib/storage/images"
import { reconcileRemoteItem } from "@/lib/sync/service"

export async function fetchDetails(
  provider: Provider,
  externalId: string,
  memberships: string[],
): Promise<RemoteCatalogItem> {
  if (provider === "steam") {
    return fetchSteamItemDetails(externalId, memberships)
  }

  if (provider === "rawg") {
    return fetchRawgItemDetails(externalId, memberships)
  }

  const account = getSyncAccount("mal")
  if (!account) {
    throw new Error("Connect MyAnimeList before syncing MAL item details.")
  }

  return fetchMalItemDetails(account, externalId, memberships)
}

export async function syncNodeDetails(nodeId: string, provider?: Provider) {
  const node = db.query.nodes.findFirst({ where: eq(nodes.id, nodeId) }).sync()
  if (!node) {
    throw new Error("Item not found.")
  }

  const refs = db.query.externalRefs.findMany({
    where: and(
      eq(externalRefs.nodeId, nodeId),
      eq(externalRefs.isActive, true),
      provider ? eq(externalRefs.provider, provider) : undefined,
    ),
  }).sync()
  if (!refs.length) {
    throw new Error("This item has no active provider references.")
  }

  const updated: Provider[] = []
  const failures: string[] = []
  const responses: unknown[] = []

  for (const ref of refs) {
    try {
      const memberships = parseJson<string[]>(ref.listMemberships, [])
      const item = await fetchDetails(ref.provider, ref.externalId, memberships)
      await reconcileRemoteItem(item, [])
      if (ref.provider === "rawg") {
        try {
          const screenshots = await fetchRawgGameScreenshots(ref.externalId)
          await syncManagedGalleryImages(
            nodeId,
            "rawg",
            screenshots.map((shot) => ({
              sourceUrl: shot.image,
              width: shot.width,
              height: shot.height,
            })),
          )
        } catch (error) {
          failures.push(
            `RAWG gallery: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
      updated.push(ref.provider)
    } catch (error) {
      failures.push(
        `${ref.provider.toUpperCase()}: ${error instanceof Error ? error.message : String(error)}`,
      )
      if (error instanceof ProviderParseError) {
        responses.push(error.response)
      }
    }
  }

  if (!updated.length) {
    throw new ProviderParseError(
      failures.join(" ") || "No provider details could be updated.",
      responses.length === 1 ? responses[0] : responses,
    )
  }

  return {
    updated: [...new Set(updated)],
    failures,
    responses,
  }
}
