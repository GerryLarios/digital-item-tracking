import "@/lib/server-only"

import { z } from "zod"

import type {
  ProviderSyncResult,
  RemoteAttribute,
  RemoteCatalogItem,
} from "@/lib/providers/types"
import { ProviderParseError } from "@/lib/providers/types"
import { getEnv } from "@/lib/env"
import { fetchJson, fetchWithTimeout } from "@/lib/http"
import type { ParsedSyncAccount } from "@/lib/integrations/service"
import { upsertSyncAccount } from "@/lib/integrations/service"

const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  token_type: z.string(),
})

const animeListPageSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            node: z
              .object({
                id: z.number(),
                title: z.string(),
                synopsis: z.string().optional(),
                nsfw: z.string().optional(),
                media_type: z.string().optional(),
                main_picture: z
                  .object({
                    medium: z.string().optional(),
                    large: z.string().optional(),
                  })
                  .optional(),
                alternative_titles: z
                  .object({
                    en: z.string().optional(),
                    ja: z.string().optional(),
                    synonyms: z.array(z.string()).optional(),
                  })
                  .optional(),
                start_season: z
                  .object({
                    year: z.number().optional(),
                  })
                  .optional(),
                genres: z.array(z.object({ name: z.string() })).optional(),
                studios: z.array(z.object({ name: z.string() })).optional(),
              })
              .passthrough(),
            list_status: z
              .object({
                status: z.string(),
                updated_at: z.string().optional(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .default([]),
    paging: z
      .object({
        next: z.string().optional(),
      })
      .optional(),
  })
  .passthrough()

const profileSchema = z
  .object({
    id: z.number().optional(),
    name: z.string().optional(),
    picture: z.string().optional(),
    location: z.string().optional(),
    joined_at: z.string().optional(),
    anime_statistics: z.record(z.string(), z.any()).optional(),
    favorites: z.any().optional(),
  })
  .passthrough()

const animeDetailsSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    main_picture: z
      .object({
        medium: z.string().optional(),
        large: z.string().optional(),
      })
      .optional(),
    alternative_titles: z
      .object({
        en: z.string().optional(),
        ja: z.string().optional(),
        synonyms: z.array(z.string()).optional(),
      })
      .optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    synopsis: z.string().optional(),
    mean: z.number().optional(),
    rank: z.number().optional(),
    popularity: z.number().optional(),
    nsfw: z.string().optional(),
    media_type: z.string().optional(),
    status: z.string().optional(),
    genres: z.array(z.object({ name: z.string() })).optional(),
    num_episodes: z.number().optional(),
    start_season: z.object({ year: z.number(), season: z.string() }).optional(),
    broadcast: z.object({ day_of_the_week: z.string(), start_time: z.string().optional() }).optional(),
    source: z.string().optional(),
    average_episode_duration: z.number().optional(),
    rating: z.string().optional(),
    studios: z.array(z.object({ name: z.string() })).optional(),
    related_anime: z
      .array(
        z.object({
          node: z.object({ id: z.number(), title: z.string() }),
          relation_type_formatted: z.string().optional(),
        }),
      )
      .optional(),
    related_manga: z
      .array(
        z.object({
          node: z.object({ id: z.number(), title: z.string() }),
          relation_type_formatted: z.string().optional(),
        }),
      )
      .optional(),
  })
  .passthrough()

function requireMalCredentials() {
  const env = getEnv()
  if (!env.malClientId || !env.malClientSecret) {
    throw new Error("Set MAL_CLIENT_ID and MAL_CLIENT_SECRET before using MyAnimeList.")
  }

  return {
    clientId: env.malClientId,
    clientSecret: env.malClientSecret,
    redirectUri: env.malRedirectUri,
  }
}

function createFormBody(values: Record<string, string>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    params.set(key, value)
  }
  return params
}

export function buildMalAuthorizationUrl({
  state,
  codeChallenge,
}: {
  state: string
  codeChallenge: string
}) {
  const { clientId, redirectUri } = requireMalCredentials()
  const url = new URL("https://myanimelist.net/v1/oauth2/authorize")
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("state", state)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("code_challenge", codeChallenge)
  url.searchParams.set("code_challenge_method", "plain")
  return url.toString()
}

async function requestToken(body: URLSearchParams) {
  const { clientId, clientSecret } = requireMalCredentials()
  const response = await fetchWithTimeout("https://myanimelist.net/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: createFormBody({
      client_id: clientId,
      client_secret: clientSecret,
      ...Object.fromEntries(body.entries()),
    }),
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`MAL token request failed (${response.status}): ${text}`)
  }

  return tokenResponseSchema.parse(text ? JSON.parse(text) : {})
}

export async function exchangeMalAuthorizationCode(code: string, codeVerifier: string) {
  const { redirectUri } = requireMalCredentials()
  return requestToken(
    createFormBody({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  )
}

export async function refreshMalAccessToken(refreshToken: string) {
  return requestToken(
    createFormBody({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  )
}

async function ensureAccessToken(account: ParsedSyncAccount) {
  if (!account.accessToken) {
    throw new Error("Connect MyAnimeList before running sync.")
  }

  const expiresAt = account.accessTokenExpiresAt
  const expiresSoon = expiresAt ? expiresAt.getTime() - Date.now() < 60_000 : false

  if (!expiresSoon) {
    return account.accessToken
  }

  if (!account.refreshToken) {
    throw new Error("Reconnect MyAnimeList because the stored refresh token is missing.")
  }

  const refreshed = await refreshMalAccessToken(account.refreshToken)
  upsertSyncAccount("mal", {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
  })

  return refreshed.access_token
}

async function malFetch<T>(account: ParsedSyncAccount, path: string, params?: Record<string, string>) {
  const accessToken = await ensureAccessToken(account)
  const url = new URL(path, "https://api.myanimelist.net/v2/")

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
  }

  return fetchJson<T>(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  })
}

function mapMalStatus(status: string) {
  switch (status) {
    case "watching":
      return "IN_PROGRESS" as const
    case "completed":
      return "COMPLETED" as const
    case "dropped":
      return "DROPPED" as const
    case "on_hold":
      return "ON_HOLD" as const
    case "plan_to_watch":
    default:
      return "NOT_STARTED" as const
  }
}

function mapAnimeToItem({
  externalId,
  anime,
  memberships,
  status,
  updatedAt,
}: {
  externalId: string
  anime: Record<string, unknown>
  memberships: string[]
  status?: string | null
  updatedAt?: string | null
}): RemoteCatalogItem {
  const mainPicture = anime.main_picture as { medium?: string; large?: string } | undefined
  const genres = Array.isArray(anime.genres) ? anime.genres : []
  const genreNames = genres
    .map((genre) => (genre && typeof genre === "object" && "name" in genre ? String(genre.name) : null))
    .filter((value): value is string => Boolean(value))
  const studios = Array.isArray(anime.studios) ? anime.studios : []
  const alternativeTitles =
    anime.alternative_titles && typeof anime.alternative_titles === "object"
      ? (anime.alternative_titles as {
          en?: string
          ja?: string
          synonyms?: string[]
        })
      : undefined

  return {
    provider: "mal",
    externalId,
    mediaType: "ANIME",
    title: String(anime.title),
    description: typeof anime.synopsis === "string" ? anime.synopsis : null,
    status: status ? mapMalStatus(status) : null,
    releaseYear:
      anime.start_season && typeof anime.start_season === "object" && "year" in anime.start_season
        ? Number((anime.start_season as { year?: number }).year)
        : null,
    nsfw:
      (typeof anime.nsfw === "string" && anime.nsfw !== "white") ||
      genreNames.some((genre) => getEnv().nsfwGenres.includes(genre)),
    memberships,
    externalUrl: `https://myanimelist.net/anime/${externalId}`,
    imageUrl: mainPicture?.large ?? mainPicture?.medium ?? null,
    remoteUpdatedAt: updatedAt ? new Date(updatedAt) : null,
    sourceData: {
      mediaType: typeof anime.media_type === "string" ? anime.media_type : null,
    },
    attributes: [
      ...genreNames.map((value) => ({ key: "genre", value, valueType: "text" as const })),
      ...studios
        .map((studio) => (studio && typeof studio === "object" && "name" in studio ? String(studio.name) : null))
        .filter((value): value is string => Boolean(value))
        .map((value) => ({ key: "studio", value, valueType: "text" as const })),
      ...[alternativeTitles?.en, alternativeTitles?.ja, ...(alternativeTitles?.synonyms ?? [])]
        .filter((value): value is string => Boolean(value))
        .map((value) => ({ key: "alternativeName", value: String(value), valueType: "text" as const })),
    ],
  }
}

function extractFavoriteAnime(profile: Record<string, unknown>) {
  const favorites = profile.favorites

  if (!favorites || typeof favorites !== "object") {
    return [] as Array<Record<string, unknown>>
  }

  const animeFavorites = (favorites as { anime?: unknown }).anime
  if (!Array.isArray(animeFavorites)) {
    return [] as Array<Record<string, unknown>>
  }

  return animeFavorites
    .map((entry) => {
      if (entry && typeof entry === "object" && "node" in entry && entry.node && typeof entry.node === "object") {
        return entry.node as Record<string, unknown>
      }

      if (entry && typeof entry === "object") {
        return entry as Record<string, unknown>
      }

      return null
    })
    .filter((value): value is Record<string, unknown> => Boolean(value))
}

export async function fetchMalProfile(account: ParsedSyncAccount) {
  return profileSchema.parse(
    await malFetch<Record<string, unknown>>(account, "users/@me", {
      fields: "anime_statistics,favorites,picture,location,joined_at",
    }),
  )
}

async function fetchEntireAnimeList(account: ParsedSyncAccount) {
  const items: z.infer<typeof animeListPageSchema>["data"] = []
  let nextUrl: string | null = "https://api.myanimelist.net/v2/users/@me/animelist?limit=1000&sort=list_updated_at&fields=list_status,main_picture,alternative_titles,start_season,media_type,genres,studios,synopsis,nsfw"

  while (nextUrl) {
    const accessToken = await ensureAccessToken(account)
    const response = await fetchWithTimeout(nextUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    })

    const text = await response.text()
    if (!response.ok) {
      throw new Error(`MAL anime list request failed (${response.status}): ${text}`)
    }

    const page = animeListPageSchema.parse(text ? JSON.parse(text) : {})
    items.push(...page.data)
    nextUrl = page.paging?.next ?? null
  }

  return items
}

export async function fetchMalItemDetails(
    account: ParsedSyncAccount,
    externalId: string,
    memberships: string[],
  ): Promise<RemoteCatalogItem> {
    const fields = [
      "id",
      "title",
      "main_picture",
      "alternative_titles",
      "start_date",
      "end_date",
      "synopsis",
      "mean",
      "rank",
      "popularity",
      "nsfw",
      "media_type",
      "status",
      "genres",
      "num_episodes",
      "start_season",
      "broadcast",
      "source",
      "average_episode_duration",
      "rating",
      "studios",
      "related_anime",
      "related_manga",
    ].join(",")
    const rawResponse = await malFetch<Record<string, unknown>>(
      account,
      `anime/${externalId}`,
      { fields },
    )
    let details: z.infer<typeof animeDetailsSchema>
    try {
      details = animeDetailsSchema.parse(rawResponse)
    } catch (error) {
      throw new ProviderParseError(
        error instanceof Error ? error.message : String(error),
        rawResponse,
      )
    }
    const mapped = mapAnimeToItem({
      externalId,
      anime: details,
      memberships,
    })
    const attributes: RemoteAttribute[] = [...(mapped.attributes ?? [])]

    for (const [key, value, valueType] of [
      ["mediaType", details.media_type, "text"],
      ["startDate", details.start_date, "date"],
      ["endDate", details.end_date, "date"],
      ["episodes", details.num_episodes, "number"],
      ["durationSeconds", details.average_episode_duration, "number"],
      ["rating", details.rating, "text"],
      ["score", details.mean, "number"],
      ["rank", details.rank, "number"],
      ["popularity", details.popularity, "number"],
      ["source", details.source, "text"],
      ["status", details.status, "text"],
    ] as const) {
      if (value !== undefined) {
        attributes.push({ key, value: String(value), valueType })
      }
    }
    if (details.start_season) {
      attributes.push({
        key: "season",
        value: `${details.start_season.season} ${details.start_season.year}`,
        valueType: "text",
      })
    }
    if (details.broadcast) {
      attributes.push({
        key: "broadcast",
        value: [details.broadcast.day_of_the_week, details.broadcast.start_time]
          .filter(Boolean)
          .join(" "),
        valueType: "text",
      })
    }
    for (const related of details.related_anime ?? []) {
      attributes.push({
        key: "relatedAnime",
        value: `https://myanimelist.net/anime/${related.node.id}`,
        valueType: "url",
      })
    }
    for (const related of details.related_manga ?? []) {
      attributes.push({
        key: "relatedManga",
        value: `https://myanimelist.net/manga/${related.node.id}`,
        valueType: "url",
      })
    }

    const seen = new Set<string>()
    return {
      ...mapped,
      releaseYear: details.start_date
        ? Number.parseInt(details.start_date.slice(0, 4), 10)
        : mapped.releaseYear,
      sourceData: { details: JSON.parse(JSON.stringify(rawResponse)) },
      attributes: attributes.filter((attribute) => {
        const identity = `${attribute.key}\u0000${attribute.value}`
        if (seen.has(identity)) return false
        seen.add(identity)
        return true
      }),
    }
}

export async function syncMalLibrary(account: ParsedSyncAccount): Promise<ProviderSyncResult> {
  if (!account.accessToken && !account.refreshToken) {
    throw new Error("Connect MyAnimeList before running sync.")
  }

  const warnings: string[] = []
  const items = new Map<string, RemoteCatalogItem>()
  const membershipSnapshots: Record<string, string[]> = {
    list: [],
  }

  const animeList = await fetchEntireAnimeList(account)
  for (const entry of animeList) {
    const externalId = String(entry.node.id)
    membershipSnapshots.list.push(externalId)
    items.set(
      externalId,
      mapAnimeToItem({
        externalId,
        anime: entry.node,
        memberships: ["list"],
        status: entry.list_status.status,
        updatedAt: entry.list_status.updated_at ?? undefined,
      }),
    )
  }

  let profile: z.infer<typeof profileSchema> | undefined
  try {
    profile = await fetchMalProfile(account)
    const favorites = extractFavoriteAnime(profile)
    membershipSnapshots.favorite = []

    for (const favorite of favorites) {
      const id = favorite.id ? String(favorite.id) : null
      if (!id) continue

      membershipSnapshots.favorite.push(id)
      const existing = items.get(id)

      items.set(
        id,
        existing
          ? {
              ...existing,
              memberships: [...new Set([...existing.memberships, "favorite"])],
            }
          : mapAnimeToItem({
              externalId: id,
              anime: favorite,
              memberships: ["favorite"],
            }),
      )
    }
  } catch (error) {
    warnings.push(
      `MAL profile/favorites import did not complete: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  return {
    items: [...items.values()],
    warnings,
    membershipSnapshots,
    profile: profile ? JSON.parse(JSON.stringify(profile)) : undefined,
    externalAccountId: profile?.id ? String(profile.id) : account.externalAccountId,
    displayName: profile?.name ?? account.displayName,
  }
}
