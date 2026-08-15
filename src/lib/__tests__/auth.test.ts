import { describe, expect, it } from "vitest"

import { hasAnyUsers, isInitialSetupOpen } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { users } from "@/lib/db/schema"
import { createId } from "@/lib/helpers"

describe("initial setup guard", () => {
  it("closes setup after the first user exists", () => {
    expect(hasAnyUsers()).toBe(false)
    expect(isInitialSetupOpen()).toBe(true)

    const now = new Date()
    db.insert(users)
      .values({
        id: createId(),
        name: "Owner",
        email: "owner@example.com",
        emailVerified: true,
        image: null,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    expect(hasAnyUsers()).toBe(true)
    expect(isInitialSetupOpen()).toBe(false)

    expect(() =>
      db.insert(users)
        .values({
          id: createId(),
          name: "Second owner",
          email: "second@example.com",
          emailVerified: true,
          image: null,
          createdAt: now,
          updatedAt: now,
        })
        .run(),
    ).toThrow("This application supports exactly one user")
  })
})
