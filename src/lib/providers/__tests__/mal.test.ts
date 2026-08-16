import { afterEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/lib/env";
import type { ParsedSyncAccount } from "@/lib/integrations/service";
import { syncMalLibrary } from "@/lib/providers/mal";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

describe("MyAnimeList provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  it("maps list statuses and favorites", async () => {
    vi.stubEnv("NSFW_GENRES", "Ecchi");
    resetEnvCache();

    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/users/@me/animelist")) {
          return jsonResponse({
            data: [
              {
                node: {
                  id: 1,
                  title: "Frieren",
                  synopsis: "After the hero's funeral.",
                  nsfw: "white",
                  genres: [{ name: "Fantasy" }],
                  studios: [{ name: "Madhouse" }],
                  main_picture: { medium: "https://example.test/frieren.png" },
                  alternative_titles: {
                    en: "Frieren: Beyond Journey's End",
                    synonyms: ["Sousou no Frieren"],
                  },
                },
                list_status: {
                  status: "watching",
                  updated_at: "2024-01-01T00:00:00+00:00",
                },
              },
              {
                node: {
                  id: 3,
                  title: "Highschool DxD",
                  synopsis: "Rias is nice.",
                  nsfw: "white",
                  genres: [{ name: "Ecchi" }, { name: "Harem" }],
                  studios: [{ name: "TNK" }],
                  main_picture: { medium: "https://example.test/dxd.png" },
                },
                list_status: {
                  status: "completed",
                  updated_at: "2024-01-02T00:00:00+00:00",
                },
              },
            ],
            paging: {},
          });
        }

        if (url.includes("/users/@me?fields=")) {
          return jsonResponse({
            id: 42,
            name: "anime-owner",
            picture: "https://example.test/profile.png",
            favorites: {
              anime: [
                {
                  node: {
                    id: 2,
                    title: "Spirited Away",
                    main_picture: {
                      medium: "https://example.test/spirited-away.png",
                    },
                  },
                },
              ],
            },
          });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      });

    const account: ParsedSyncAccount = {
      id: "mal-account",
      provider: "mal",
      enabled: true,
      externalAccountId: null,
      displayName: null,
      accessToken: "token",
      refreshToken: "refresh",
      accessTokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      refreshTokenExpiresAt: null,
      config: {},
      profile: {},
      lastSyncedAt: null,
      lastSuccessfulSyncAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await syncMalLibrary(account);

    expect(result.items).toHaveLength(3);
    expect(result.items[0]?.status).toBe("IN_PROGRESS");
    expect(
      result.items[0]?.attributes?.some(
        (attribute) => attribute.value === "Fantasy",
      ),
    ).toBe(true);
    expect(result.membershipSnapshots.list).toEqual(["1", "3"]);
    expect(result.membershipSnapshots.favorite).toEqual(["2"]);
    expect(result.displayName).toBe("anime-owner");

    const frieren = result.items.find((item) => item.externalId === "1");
    const dxd = result.items.find((item) => item.externalId === "3");
    expect(frieren?.nsfw).toBe(false);
    expect(dxd?.nsfw).toBe(true);
    expect(
      dxd?.attributes?.some((attribute) => attribute.value === "Ecchi"),
    ).toBe(true);

    fetchSpy.mockRestore();
  });
});
