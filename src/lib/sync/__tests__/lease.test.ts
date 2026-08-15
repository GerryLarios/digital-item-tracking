import { describe, expect, it } from "vitest"

import { acquireSyncLease, heartbeatSyncLease, releaseSyncLease } from "@/lib/sync/lease"

describe("sync lease", () => {
  it("prevents overlapping providers runs", () => {
    expect(acquireSyncLease("steam", "owner-a")).toBe(true)
    expect(acquireSyncLease("steam", "owner-b")).toBe(false)
    expect(heartbeatSyncLease("steam", "owner-a")).toBe(true)
    expect(releaseSyncLease("steam", "owner-a")).toBe(true)
    expect(acquireSyncLease("steam", "owner-b")).toBe(true)
  })
})
