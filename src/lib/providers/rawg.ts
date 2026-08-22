import "@/lib/server-only";

import { z } from "zod";

import { getEnv } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import type { RemoteAttribute, RemoteCatalogItem } from "@/lib/providers/types";
import { ProviderParseError } from "@/lib/providers/types";

const rawgSearchSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        slug: z.string(),
        name: z.string(),
      }),
    )
    .default([]),
});

const rawgGameDetailsSchema = z
  .object({
    id: z.number(),
    slug: z.string(),
    name: z.string(),
    name_original: z.string().optional(),
    description_raw: z.string().optional(),
    description: z.string().optional(),
    released: z.string().nullish(),
    tba: z.boolean().optional(),
    background_image: z.string().url().nullish(),
    website: z.string().url().nullish(),
    metacritic: z.number().nullish(),
    genres: z.array(z.object({ name: z.string() })).optional(),
    platforms: z
      .array(z.object({ platform: z.object({ name: z.string() }) }))
      .optional(),
    developers: z.array(z.object({ name: z.string() })).optional(),
    publishers: z.array(z.object({ name: z.string() })).optional(),
    esrb_rating: z.object({ name: z.string(), slug: z.string() }).nullish(),
  })
  .passthrough();

function requireApiKey() {
  const apiKey = getEnv().rawgApiKey;
  if (!apiKey) {
    throw new Error("Set RAWG_API_KEY before using the RAWG integration.");
  }

  return apiKey;
}

function authenticatedUrl(pathname: string, params?: Record<string, string>) {
  const url = new URL(`https://api.rawg.io/api${pathname}`);
  url.searchParams.set("key", getEnv().rawgApiKey ?? "");
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  return url;
}

export function pickExactRawgMatch(
  title: string,
  results: Array<{ id: number; name: string }>,
) {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return null;

  return (
    results.find((result) => result.name.trim().toLowerCase() === normalized) ??
    null
  );
}

export async function searchRawgGameByTitle(title: string) {
  requireApiKey();
  const url = authenticatedUrl("/games", {
    search: title,
    search_exact: "true",
    page_size: "20",
  });

  const payload = await fetchJson<unknown>(url);
  const response = rawgSearchSchema.parse(payload);

  return pickExactRawgMatch(
    title,
    response.results.map((result) => ({
      id: result.id,
      name: result.name,
    })),
  );
}

function stripHtml(value: string | undefined | null) {
  if (!value) return null;

  const text = value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || null;
}

export async function fetchRawgItemDetails(
  externalId: string,
  memberships: string[],
): Promise<RemoteCatalogItem> {
  requireApiKey();
  const url = authenticatedUrl(`/games/${encodeURIComponent(externalId)}`);

  let details: z.infer<typeof rawgGameDetailsSchema>;
  try {
    details = rawgGameDetailsSchema.parse(await fetchJson<unknown>(url));
  } catch (error) {
    throw new ProviderParseError(
      error instanceof Error ? error.message : String(error),
      error instanceof ProviderParseError ? error.response : null,
    );
  }

  const attributes: RemoteAttribute[] = [
    ...(details.genres ?? []).map((genre) => ({
      key: "genre",
      value: genre.name,
      valueType: "text" as const,
    })),
    ...(details.platforms ?? []).map((entry) => ({
      key: "platform",
      value: entry.platform.name,
      valueType: "text" as const,
    })),
    ...(details.developers ?? []).map((developer) => ({
      key: "developer",
      value: developer.name,
      valueType: "text" as const,
    })),
    ...(details.publishers ?? []).map((publisher) => ({
      key: "publisher",
      value: publisher.name,
      valueType: "text" as const,
    })),
  ];

  if (details.website) {
    attributes.push({
      key: "website",
      value: details.website,
      valueType: "url",
    });
  }
  if (details.metacritic != null) {
    attributes.push({
      key: "metacriticScore",
      value: String(details.metacritic),
      valueType: "number",
    });
  }
  if (details.esrb_rating?.name) {
    attributes.push({
      key: "esrbRating",
      value: details.esrb_rating.name,
      valueType: "text",
    });
  }

  const releaseYear = details.released
    ? Number(details.released.slice(0, 4))
    : null;

  return {
    provider: "rawg",
    externalId: String(details.id),
    mediaType: "GAME",
    title: details.name_original || details.name,
    description:
      stripHtml(details.description_raw) ?? stripHtml(details.description),
    releaseYear:
      releaseYear && Number.isFinite(releaseYear) ? releaseYear : null,
    nsfw: details.esrb_rating?.slug === "adults-only",
    memberships,
    externalUrl: `https://rawg.io/games/${details.slug}`,
    imageUrl: details.background_image ?? null,
    sourceData: { details },
    attributes,
  };
}
