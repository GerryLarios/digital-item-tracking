import { describe, expect, it } from "vitest";

import { pickExactRawgMatch } from "@/lib/providers/rawg";

describe("pickExactRawgMatch", () => {
  it("matches candidates case-insensitively after trimming", () => {
    expect(
      pickExactRawgMatch("  elden ring ", [
        { id: 2, name: "Elden Ring: Nightreign" },
        { id: 1, name: "ELDEN RING" },
      ]),
    ).toMatchObject({ id: 1 });
  });

  it("returns null when nothing matches exactly", () => {
    expect(
      pickExactRawgMatch("Dark Souls", [{ id: 3, name: "Dark Souls III" }]),
    ).toBeNull();
    expect(pickExactRawgMatch("   ", [{ id: 4, name: "" }])).toBeNull();
  });
});
