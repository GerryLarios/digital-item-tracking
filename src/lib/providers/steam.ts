import "@/lib/server-only";

import { z } from "zod";

import { getEnv } from "@/lib/env";
import { fetchJson, fetchWithTimeout } from "@/lib/http";
import type { ParsedSyncAccount } from "@/lib/integrations/service";
import type {
  ProviderSyncResult,
  RemoteAttribute,
  RemoteCatalogItem,
} from "@/lib/providers/types";
import { ProviderParseError } from "@/lib/providers/types";

const ownedGamesSchema = z.object({
  response: z.object({
    games: z
      .array(
        z.object({
          appid: z.number(),
          name: z.string(),
          playtime_forever: z.number().optional(),
          img_icon_url: z.string().optional(),
        }),
      )
      .default([]),
  }),
});

const wishlistSchema = z.object({
  response: z.object({
    items: z
      .array(
        z.object({
          appid: z.number(),
          priority: z.number().optional(),
          date_added: z.number().optional(),
        }),
      )
      .optional(),
  }),
});

const storeItemsSchema = z.object({
  response: z.object({
    store_items: z
      .array(
        z.object({
          appid: z.number(),
          name: z.string(),
          release: z
            .object({
              steam_release_date: z.number().optional(),
            })
            .optional(),
          reviews: z
            .object({
              summary_filtered: z
                .object({
                  review_score_label: z.string().optional(),
                })
                .optional(),
            })
            .optional(),
        }),
      )
      .default([]),
  }),
});

const steamAppDetailsSchema = z
  .object({
    type: z.string().optional(),
    name: z.string(),
    steam_appid: z.number(),
    short_description: z.string().optional(),
    detailed_description: z.string().optional(),
    header_image: z.string().url().optional(),
    website: z.string().url().nullable().optional(),
    developers: z.array(z.string()).optional(),
    publishers: z.array(z.string()).optional(),
    platforms: z
      .object({
        windows: z.boolean().optional(),
        mac: z.boolean().optional(),
        linux: z.boolean().optional(),
      })
      .optional(),
    genres: z
      .array(z.object({ id: z.string(), description: z.string() }))
      .optional(),
    categories: z
      .array(z.object({ id: z.number(), description: z.string() }))
      .optional(),
    release_date: z
      .object({
        coming_soon: z.boolean().optional(),
        date: z.string().optional(),
      })
      .optional(),
    recommendations: z.object({ total: z.number() }).optional(),
    metacritic: z
      .object({ score: z.number(), url: z.string().optional() })
      .optional(),
    pc_requirements: z.unknown().optional(),
    mac_requirements: z.unknown().optional(),
    linux_requirements: z.unknown().optional(),
    content_descriptors: z
      .object({
        ids: z.array(z.number()).optional(),
        notes: z.string().nullish(),
      })
      .optional(),
  })
  .passthrough();

const steamAppDetailsResponseSchema = z.record(
  z.string(),
  z.object({
    success: z.boolean(),
    data: steamAppDetailsSchema.optional(),
  }),
);

const ADULT_CONTENT_DESCRIPTOR_IDS = new Set([1, 3, 4]);
const ADULT_LABEL_PATTERN =
  /\b(adult|hentai|nudity|sexual content|sexually explicit)\b/i;

function requirementText(value: unknown) {
  if (!value || Array.isArray(value) || typeof value !== "object") return [];

  return Object.entries(value)
    .filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && Boolean(entry[1]),
    )
    .map(([key, text]) => ({ key, text }));
}

function dedupeAttributes(attributes: RemoteAttribute[]) {
  const seen = new Set<string>();
  return attributes.filter((attribute) => {
    const identity = `${attribute.key}\u0000${attribute.value}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function isSteamNsfw(details: z.infer<typeof steamAppDetailsSchema>) {
  const descriptorMatch = details.content_descriptors?.ids?.some((id) =>
    ADULT_CONTENT_DESCRIPTOR_IDS.has(id),
  );
  const labels = [
    ...(details.genres?.map((genre) => genre.description) ?? []),
    ...(details.categories?.map((category) => category.description) ?? []),
    details.content_descriptors?.notes ?? "",
  ];

  return Boolean(
    descriptorMatch || labels.some((label) => ADULT_LABEL_PATTERN.test(label)),
  );
}

function summarizeWishlistResponse(response: Response, body: string) {
  const contentType = response.headers.get("content-type") ?? "missing";
  const preview = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

  return [
    `status=${response.status} ${response.statusText || "unknown"}`,
    `content-type=${contentType}`,
    `redirected=${response.redirected}`,
    `final-url=${redactUrl(response.url)}`,
    `body-preview=${preview || "(empty)"}`,
  ].join("; ");
}

function redactUrl(value: string) {
  if (!value) return "unavailable";

  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}${url.search ? "?[redacted]" : ""}`;
  } catch {
    return "unavailable";
  }
}

function getSteamId(account: ParsedSyncAccount) {
  const steamId =
    typeof account.config.steamId === "string" ? account.config.steamId : null;
  if (!steamId) {
    throw new Error("Configure a SteamID64 before running Steam sync.");
  }

  return steamId;
}

function getHeaderImageUrl(appId: number) {
  return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
}

async function fetchOwnedGames(steamId: string) {
  const env = getEnv();
  if (!env.steamApiKey) {
    throw new Error("Set STEAM_API_KEY before using the Steam integration.");
  }

  const url = new URL(
    "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/",
  );
  url.searchParams.set("key", env.steamApiKey);
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("include_appinfo", "true");
  url.searchParams.set("include_played_free_games", "true");
  url.searchParams.set("format", "json");

  return ownedGamesSchema.parse(await fetchJson(url));
}

async function fetchWishlist(steamId: string) {
  const steamApiKey = getEnv().steamApiKey;
  const url = new URL(
    "https://api.steampowered.com/IWishlistService/GetWishlist/v1/",
  );
  url.searchParams.set("steamid", steamId);
  if (steamApiKey) {
    url.searchParams.set("key", steamApiKey);
  }
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json",
    },
  });

  const text = await response.text();
  const diagnostics = summarizeWishlistResponse(response, text);

  if (!response.ok) {
    throw new Error(`Wishlist request failed: ${diagnostics}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`Wishlist response was not valid JSON: ${diagnostics}`);
  }

  const wishlist = wishlistSchema.parse(raw);
  if (!wishlist.response.items) {
    throw new Error(
      "Steam did not expose this wishlist. In Steam, set Profile and Game details visibility to Public, then try again.",
    );
  }

  return wishlist.response.items;
}

async function fetchSharedWishlist(shareUrl: string) {
  const parsedUrl = new URL(shareUrl);
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "store.steampowered.com" ||
    !parsedUrl.pathname.startsWith("/wishlist/")
  ) {
    throw new Error("The configured Steam wishlist share URL is invalid.");
  }

  const response = await fetchWithTimeout(parsedUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
    },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Shared wishlist request failed: ${summarizeWishlistResponse(response, body)}`,
    );
  }

  const appIds = new Set<number>();
  for (const pattern of [
    /\/app\/(\d+)/g,
    /data-ds-appid=["'](\d+)["']/g,
    /["']appid["']\s*:\s*(\d+)/g,
  ]) {
    for (const match of body.matchAll(pattern)) {
      const appId = Number.parseInt(match[1] ?? "", 10);
      if (Number.isFinite(appId)) appIds.add(appId);
    }
  }

  if (!appIds.size) {
    throw new Error(
      `The shared wishlist loaded but contained no recognizable games: ${summarizeWishlistResponse(response, body)}`,
    );
  }

  return [...appIds].map((appid) => ({
    appid,
    priority: undefined,
    date_added: undefined,
  }));
}

async function fetchWishlistMetadata(appIds: number[]) {
  const metadata = new Map<
    number,
    z.infer<typeof storeItemsSchema>["response"]["store_items"][number]
  >();

  for (let index = 0; index < appIds.length; index += 50) {
    const chunk = appIds.slice(index, index + 50);
    const url = new URL(
      "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/",
    );
    url.searchParams.set(
      "input_json",
      JSON.stringify({
        context: { country_code: "US", language: "english" },
        data_request: {
          include_basic_info: true,
          include_release: true,
          include_reviews: true,
        },
        ids: chunk.map((appid) => ({ appid })),
      }),
    );

    try {
      const payload = storeItemsSchema.parse(await fetchJson(url));
      for (const item of payload.response.store_items) {
        metadata.set(item.appid, item);
      }
    } catch (error) {
      console.warn(
        `Steam wishlist metadata batch failed for ${chunk.length} items: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return metadata;
}

export async function fetchSteamItemDetails(
  externalId: string,
  memberships: string[],
): Promise<RemoteCatalogItem> {
  const url = new URL("https://store.steampowered.com/api/appdetails");
  url.searchParams.set("appids", externalId);
  url.searchParams.set("l", "english");
  url.searchParams.set("cc", "US");

  const rawResponse = await fetchJson<unknown>(url);
  let response: z.infer<typeof steamAppDetailsResponseSchema>;
  try {
    response = steamAppDetailsResponseSchema.parse(rawResponse);
  } catch (error) {
    throw new ProviderParseError(
      error instanceof Error ? error.message : String(error),
      rawResponse,
    );
  }
  const result = response[externalId];
  if (!result?.success || !result.data) {
    throw new Error(`Steam did not return details for App ID ${externalId}.`);
  }

  const details = result.data;
  const attributes: RemoteAttribute[] = [
    ...(details.genres ?? []).map((genre) => ({
      key: "genre",
      value: genre.description,
      valueType: "text" as const,
    })),
    ...(details.categories ?? []).map((category) => ({
      key: "category",
      value: category.description,
      valueType: "text" as const,
    })),
    ...(details.developers ?? []).map((developer) => ({
      key: "developer",
      value: developer,
      valueType: "text" as const,
    })),
    ...(details.publishers ?? []).map((publisher) => ({
      key: "publisher",
      value: publisher,
      valueType: "text" as const,
    })),
  ];

  for (const [platform, supported] of Object.entries(details.platforms ?? {})) {
    if (supported)
      attributes.push({ key: "platform", value: platform, valueType: "text" });
  }
  if (details.release_date?.date) {
    attributes.push({
      key: "releaseDate",
      value: details.release_date.date,
      valueType: "date",
    });
  }
  if (details.website) {
    attributes.push({
      key: "website",
      value: details.website,
      valueType: "url",
    });
  }
  if (details.recommendations) {
    attributes.push({
      key: "recommendations",
      value: String(details.recommendations.total),
      valueType: "number",
    });
  }
  if (details.metacritic) {
    attributes.push({
      key: "metacriticScore",
      value: String(details.metacritic.score),
      valueType: "number",
    });
    if (details.metacritic.url) {
      attributes.push({
        key: "metacriticUrl",
        value: details.metacritic.url,
        valueType: "url",
      });
    }
  }
  for (const [platform, requirements] of [
    ["pc", details.pc_requirements],
    ["mac", details.mac_requirements],
    ["linux", details.linux_requirements],
  ] as const) {
    for (const requirement of requirementText(requirements)) {
      attributes.push({
        key: `${platform}Requirements${requirement.key === "minimum" ? "Minimum" : "Recommended"}`,
        value: requirement.text,
        valueType: "text",
      });
    }
  }

  const releaseYearMatch =
    details.release_date?.date?.match(/\b(19|20)\d{2}\b/);

  return {
    provider: "steam",
    externalId,
    mediaType: "GAME",
    title: details.name,
    description:
      details.short_description ?? details.detailed_description ?? null,
    releaseYear: releaseYearMatch ? Number(releaseYearMatch[0]) : null,
    nsfw: isSteamNsfw(details),
    memberships,
    externalUrl: `https://store.steampowered.com/app/${externalId}`,
    imageUrl: details.header_image ?? null,
    sourceData: { details: rawResponse },
    attributes: dedupeAttributes(attributes),
  };
}

export async function syncSteamLibrary(
  account: ParsedSyncAccount,
): Promise<ProviderSyncResult> {
  const steamId = getSteamId(account);
  const owned = await fetchOwnedGames(steamId);
  const items = new Map<string, RemoteCatalogItem>();
  const warnings: string[] = [];
  const membershipSnapshots: Record<string, string[]> = {
    owned: [],
  };

  for (const game of owned.response.games) {
    const externalId = String(game.appid);
    membershipSnapshots.owned.push(externalId);

    items.set(externalId, {
      provider: "steam",
      externalId,
      mediaType: "GAME",
      title: game.name,
      status: (game.playtime_forever ?? 0) > 0 ? "IN_PROGRESS" : "NOT_STARTED",
      memberships: ["owned"],
      externalUrl: `https://store.steampowered.com/app/${game.appid}`,
      imageUrl: getHeaderImageUrl(game.appid),
      sourceData: {
        playtimeMinutes: game.playtime_forever ?? 0,
      },
      storageLocations: [
        {
          label: "Steam library",
          medium: "digital",
          platform: "Steam",
          notes:
            (game.playtime_forever ?? 0) > 0
              ? `${game.playtime_forever} minutes played`
              : null,
        },
      ],
    });
  }

  try {
    let wishlist;
    try {
      wishlist = await fetchWishlist(steamId);
    } catch (error) {
      if (!account.accessToken) throw error;
      wishlist = await fetchSharedWishlist(account.accessToken);
    }
    const wishlistMetadata = await fetchWishlistMetadata(
      wishlist.map((entry) => entry.appid),
    );
    membershipSnapshots.wishlist = [];

    for (const entry of wishlist) {
      const externalId = String(entry.appid);
      const metadata = wishlistMetadata.get(entry.appid);
      const existing = items.get(externalId);
      const releaseYear = metadata?.release?.steam_release_date
        ? new Date(metadata.release.steam_release_date * 1000).getUTCFullYear()
        : undefined;

      membershipSnapshots.wishlist.push(externalId);
      items.set(externalId, {
        provider: "steam",
        externalId,
        mediaType: "GAME",
        title: metadata?.name ?? existing?.title ?? `Steam App ${externalId}`,
        status: existing?.status ?? "NOT_STARTED",
        memberships: existing
          ? [...new Set([...existing.memberships, "wishlist"])]
          : ["wishlist"],
        externalUrl: `https://store.steampowered.com/app/${externalId}`,
        imageUrl: existing?.imageUrl ?? getHeaderImageUrl(entry.appid),
        releaseYear,
        sourceData: {
          ...(existing?.sourceData ?? {}),
          wishlistPriority: entry.priority ?? null,
          wishlistAddedAt: entry.date_added
            ? new Date(entry.date_added * 1000).toISOString()
            : null,
          wishlistReview:
            metadata?.reviews?.summary_filtered?.review_score_label ?? null,
        },
        storageLocations: existing?.storageLocations,
      });
    }
  } catch (error) {
    const warning = `Steam wishlist sync is best-effort and could not complete: ${error instanceof Error ? error.message : String(error)}`;
    console.warn(warning);
    warnings.push(warning);
  }

  return {
    items: [...items.values()],
    warnings,
    membershipSnapshots,
    externalAccountId: steamId,
    displayName: account.displayName ?? `Steam ${steamId}`,
  };
}
