import { describe, expect, it, vi } from "vitest"
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { externalRefs, nodes } from "@/lib/db/schema"
import { upsertSyncAccount } from "@/lib/integrations/service"
import {
  getMalImportFailures,
  importMalXml,
  mapMalXmlStatus,
  retryMalImportFailures,
} from "@/lib/library/mal-import"

const DETAILS_BY_ID: Record<string, Record<string, unknown>> = {
  "1": {
    id: 1,
    title: "Frieren",
    synopsis: "After the hero's funeral.",
    nsfw: "white",
    media_type: "tv",
    start_date: "2023-09-29",
    genres: [{ name: "Fantasy" }],
    studios: [{ name: "Madhouse" }],
    mean: 9.3,
    num_episodes: 28,
  },
  "2": {
    id: 2,
    title: "Spirited Away",
    nsfw: "white",
    media_type: "movie",
    start_date: "2001-07-20",
  },
  "3": {
    id: 3,
    title: "Third Anime",
    nsfw: "white",
    media_type: "tv",
  },
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  })
}

function mockDetailsFetch() {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = String(input)
    const match = url.match(/\/v2\/anime\/(\d+)\?/)
    if (!match) throw new Error(`Unexpected fetch: ${url}`)
    const details = DETAILS_BY_ID[match[1]]
    if (!details) {
      return new Response("Not found", { status: 404 })
    }
    return jsonResponse(details)
  })
}

function seedMalAccount() {
  upsertSyncAccount("mal", {
    enabled: true,
    accessToken: "token",
    refreshToken: "refresh",
    accessTokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
  })
}

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<myanimelist>
  <anime>
    <series_animedb_id>1</series_animedb_id>
    <series_title>Frieren</series_title>
    <my_status>Currently Watching</my_status>
    <my_last_updated>1700000000</my_last_updated>
  </anime>
  <anime>
    <series_animedb_id>2</series_animedb_id>
    <series_title>Spirited Away</series_title>
    <my_status>On-Hold</my_status>
  </anime>
  <anime>
    <series_animedb_id>3</series_animedb_id>
    <series_title>Third Anime</series_title>
    <my_status>Plan to Watch</my_status>
  </anime>
  <anime>
    <series_title>Missing an ID</series_title>
    <my_status>Completed</my_status>
  </anime>
</myanimelist>`

describe("importMalXml", () => {
  it("maps XML statuses", () => {
    expect(mapMalXmlStatus("Currently Watching")).toBe("IN_PROGRESS")
    expect(mapMalXmlStatus("Watching")).toBe("IN_PROGRESS")
    expect(mapMalXmlStatus("on-hold")).toBe("ON_HOLD")
    expect(mapMalXmlStatus("Dropped")).toBe("DROPPED")
    expect(mapMalXmlStatus("Plan to Watch")).toBe("NOT_STARTED")
    expect(mapMalXmlStatus("Completed")).toBe("COMPLETED")
    expect(mapMalXmlStatus("nonsense")).toBeNull()
  })

  it("imports entries via the MAL API and merges on re-run", async () => {
    seedMalAccount()
    const fetchSpy = mockDetailsFetch()
    const progressUpdates: Array<{ processed: number; total: number }> = []

    try {
      const firstRun = await importMalXml(SAMPLE_XML, (progress) => {
        progressUpdates.push({ processed: progress.processed, total: progress.total })
      })
      expect(firstRun).toEqual({ created: 3, merged: 0, skipped: 1, failed: 0 })
      expect(progressUpdates.at(-1)).toEqual({ processed: 4, total: 4 })
      expect(progressUpdates.map((update) => update.processed)).toEqual([1, 2, 3, 4])

      const frierenRef = db.query.externalRefs
        .findFirst({
          where: and(eq(externalRefs.provider, "mal"), eq(externalRefs.externalId, "1")),
        })
        .sync()
      expect(frierenRef?.externalId).toBe("1")
      expect(JSON.parse(frierenRef?.listMemberships ?? "[]")).toEqual(["list"])
      expect(frierenRef?.remoteUpdatedAt).toEqual(new Date(1_700_000_000 * 1000))

      const frierenNode = db.query.nodes
        .findFirst({ where: eq(nodes.id, frierenRef?.nodeId ?? "") })
        .sync()
      expect(frierenNode?.displayName).toBe("Frieren")
      expect(frierenNode?.status).toBe("IN_PROGRESS")

      const statuses = db.select().from(externalRefs).all().map((ref) => {
        return db.query.nodes.findFirst({ where: eq(nodes.id, ref.nodeId) }).sync()?.status
      })
      expect(statuses).toContain("ON_HOLD")
      expect(statuses).toContain("NOT_STARTED")

      const secondRun = await importMalXml(SAMPLE_XML)
      expect(secondRun).toEqual({ created: 0, merged: 3, skipped: 1, failed: 0 })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("counts failed fetches without aborting the import", async () => {
    seedMalAccount()
    const xml = SAMPLE_XML.replace(
      "<series_animedb_id>3</series_animedb_id>",
      "<series_animedb_id>999</series_animedb_id>",
    )
    const fetchSpy = mockDetailsFetch()

    try {
      const result = await importMalXml(xml)
      expect(result.failed).toBe(1)
      expect(result.created).toBe(2)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("persists failures with their error, retries them, and clears successes", async () => {
    seedMalAccount()
    const xml = SAMPLE_XML.replace(
      "<series_animedb_id>3</series_animedb_id>",
      "<series_animedb_id>999</series_animedb_id>",
    )
    const failingSpy = mockDetailsFetch()

    try {
      await importMalXml(xml)

      const failures = getMalImportFailures()
      expect(failures).toHaveLength(1)
      expect(failures[0]?.externalId).toBe("999")
      expect(failures[0]?.title).toBe("Third Anime")
      expect(failures[0]?.xmlStatus).toBe("Plan to Watch")
      expect(failures[0]?.error).toContain("Request failed (404")
    } finally {
      failingSpy.mockRestore()
    }

    // The previously failed ID now resolves on the API.
    DETAILS_BY_ID["999"] = { id: 999, title: "Recovered Anime", nsfw: "white", media_type: "tv" }
    const retrySpy = mockDetailsFetch()
    try {
      const retryResult = await retryMalImportFailures()
      expect(retryResult).toEqual({ created: 1, merged: 0, failed: 0, total: 1 })
      expect(getMalImportFailures()).toEqual([])
    } finally {
      retrySpy.mockRestore()
      delete DETAILS_BY_ID["999"]
    }
  })

  it("clears a stored failure when a later full import succeeds for that ID", async () => {
    seedMalAccount()
    const xml = SAMPLE_XML.replace(
      "<series_animedb_id>3</series_animedb_id>",
      "<series_animedb_id>999</series_animedb_id>",
    )

    const failingSpy = mockDetailsFetch()
    try {
      await importMalXml(SAMPLE_XML.replace("<series_animedb_id>3</series_animedb_id>", "<series_animedb_id>999</series_animedb_id>"))
      expect(getMalImportFailures().map((failure) => failure.externalId)).toEqual(["999"])
    } finally {
      failingSpy.mockRestore()
    }

    DETAILS_BY_ID["999"] = { id: 999, title: "Recovered Anime", nsfw: "white", media_type: "tv" }
    const successSpy = mockDetailsFetch()
    try {
      await importMalXml(xml)
      expect(getMalImportFailures()).toEqual([])
    } finally {
      successSpy.mockRestore()
      delete DETAILS_BY_ID["999"]
    }
  })

  it("rejects files that are not MyAnimeList exports", async () => {
    await expect(importMalXml("<root><thing/></root>")).rejects.toThrow(
      "not a MyAnimeList export",
    )
    await expect(importMalXml("not xml at all")).rejects.toThrow(
      "not a MyAnimeList export",
    )
  })

  it("requires a connected MAL account", async () => {
    // Valid XML, no account row: must fail at the account check.
    await expect(importMalXml(SAMPLE_XML)).rejects.toThrow(
      "Connect MyAnimeList before importing",
    )
  })
})
