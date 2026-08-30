import { afterEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/lib/env";
import { fetchRawgGameScreenshots, pickExactRawgMatch } from "@/lib/providers/rawg";

describe("pickExactRawgMatch", () => {
  it("matches candidates case-insensitively after trimming", () => {
    expect(
      pickExactRawgMatch("  elden ring ", [
        { id: 2, name: "Elden Ring: Nightreign" },
        { id: 1, name: "ELDEN RING" },
      ]),
    ).toMatchObject({ id: 1 });
  });

  it("matches titles with non-breaking spaces", () => {
    expect(
      pickExactRawgMatch("Mortal Kombat\u00a011", [
        { id: 5, name: "Mortal Kombat 11" },
      ]),
    ).toMatchObject({ id: 5 });
  });

  it("returns null when nothing matches exactly", () => {
    expect(
      pickExactRawgMatch("Dark Souls", [{ id: 3, name: "Dark Souls III" }]),
    ).toBeNull();
    expect(pickExactRawgMatch("   ", [{ id: 4, name: "" }])).toBeNull();
  });
});

describe("fetchRawgGameScreenshots", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  it("maps screenshot results and drops placeholders", async () => {
    vi.stubEnv("RAWG_API_KEY", "test-key");
    resetEnvCache();

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          count: 2,
          results: [
            { id: 1, image: "https://media.example.test/a.jpg", width: 1920, height: 1080 },
            { id: 2, image: "https://media.example.test/placeholder.jpg", width: 640, height: 360 },
          ],
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    });

    const screenshots = await fetchRawgGameScreenshots("3498");

    expect(screenshots).toEqual([
      { image: "https://media.example.test/a.jpg", width: 1920, height: 1080 },
    ]);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/games/3498/screenshots");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("key=test-key");

    fetchSpy.mockRestore();
  });
});
