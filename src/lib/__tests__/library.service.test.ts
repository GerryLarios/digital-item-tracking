import { describe, expect, it } from "vitest";

import { db } from "@/lib/db/client";
import {
  externalRefs,
  nodeAttributes,
  nodes,
  storageLocations,
} from "@/lib/db/schema";
import { createId } from "@/lib/helpers";
import {
  deleteNode,
  getNodeById,
  listNodes,
  saveManualNode,
} from "@/lib/library/service";

describe("library service", () => {
  it("creates, filters, updates, and deletes a manual node", async () => {
    const nodeId = await saveManualNode(
      {
        id: undefined,
        displayName: "Persona 5 Royal",
        mediaType: "GAME",
        status: "NOT_STARTED",
        description: "Stylish RPG",
        releaseYear: 2020,
        nsfw: false,
        hidden: false,
        notes: "Play on Steam Deck.",
        removeImage: false,
        attributes: [{ key: "genre", value: "JRPG", valueType: "text" }],
        storageLocations: [
          {
            label: "Shelf A",
            medium: "physical",
            platform: "PS5",
            notes: "Steelbook",
          },
        ],
        links: [{ label: "Official site", url: "https://persona.atlus.com" }],
      },
      null,
    );

    const created = getNodeById(nodeId);
    expect(created?.displayName).toBe("Persona 5 Royal");
    expect(created?.attributes).toHaveLength(1);
    expect(created?.storageLocations).toHaveLength(1);
    expect(created?.links).toHaveLength(1);

    const searchResults = listNodes({ q: "Persona" });
    expect(searchResults.total).toBe(1);
    expect(searchResults.items[0]?.id).toBe(nodeId);

    await saveManualNode(
      {
        id: nodeId,
        displayName: "Persona 5 Royal",
        mediaType: "GAME",
        status: "COMPLETED",
        description: "Stylish RPG",
        releaseYear: 2020,
        nsfw: false,
        hidden: true,
        notes: "Finished.",
        removeImage: false,
        attributes: [],
        storageLocations: [],
        links: [],
      },
      null,
    );

    const updated = getNodeById(nodeId);
    expect(updated?.status).toBe("COMPLETED");
    expect(updated?.hidden).toBe(true);
    expect(listNodes({ q: "Persona" }).total).toBe(0);
    expect(listNodes({ q: "Persona", showHidden: true }).total).toBe(1);

    deleteNode(nodeId);
    expect(getNodeById(nodeId)).toBeNull();
  });

  it("filters active provider references by exact collection membership", () => {
    const now = new Date();
    const wishlistNodeId = createId();
    const ownedNodeId = createId();

    db.insert(nodes)
      .values([
        {
          id: wishlistNodeId,
          mediaType: "GAME",
          displayName: "Wishlisted game",
          status: "NOT_STARTED",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: ownedNodeId,
          mediaType: "GAME",
          displayName: "Owned game",
          status: "NOT_STARTED",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    db.insert(externalRefs)
      .values([
        {
          id: createId(),
          nodeId: wishlistNodeId,
          provider: "steam",
          externalId: "10",
          listMemberships: JSON.stringify(["wishlist"]),
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: createId(),
          nodeId: ownedNodeId,
          provider: "steam",
          externalId: "20",
          listMemberships: JSON.stringify(["owned"]),
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    const result = listNodes({ provider: "steam", collection: "wishlist" });
    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe(wishlistNodeId);
  });

  it("sorts by title, wishlist status, and rating from the summary view", () => {
    const now = new Date();
    const alphaId = createId();
    const betaId = createId();
    const gammaId = createId();

    db.insert(nodes)
      .values([
        {
          id: alphaId,
          mediaType: "GAME",
          displayName: "Alpha",
          status: "NOT_STARTED",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: betaId,
          mediaType: "GAME",
          displayName: "Beta",
          status: "NOT_STARTED",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: gammaId,
          mediaType: "GAME",
          displayName: "Gamma",
          status: "NOT_STARTED",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    db.insert(externalRefs)
      .values([
        {
          id: createId(),
          nodeId: alphaId,
          provider: "steam",
          externalId: "10",
          listMemberships: JSON.stringify(["wishlist"]),
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    db.insert(nodeAttributes)
      .values([
        {
          id: createId(),
          nodeId: alphaId,
          key: "score",
          value: "8.5",
          valueType: "number",
          source: "system",
          sourceProvider: "mal",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: createId(),
          nodeId: betaId,
          key: "score",
          value: "9.5",
          valueType: "number",
          source: "system",
          sourceProvider: "mal",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    db.insert(storageLocations)
      .values([
        {
          id: createId(),
          nodeId: alphaId,
          label: "Steam library",
          medium: "digital",
          source: "system",
          sourceProvider: "steam",
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    const byTitle = listNodes({ sort: "title_asc" });
    expect(byTitle.items.map((item) => item.id)).toEqual([
      alphaId,
      betaId,
      gammaId,
    ]);

    const wishlisted = listNodes({ sort: "wishlist_desc" });
    expect(wishlisted.items[0]?.id).toBe(alphaId);

    const byRating = listNodes({ sort: "rating_desc" });
    expect(byRating.items[0]?.id).toBe(betaId);
    expect(byRating.items[1]?.id).toBe(alphaId);

    const alpha = listNodes({ q: "Alpha" }).items[0];
    expect(alpha?.providers).toEqual(["steam"]);
    expect(alpha?.mediums).toEqual(["digital"]);
    expect(alpha?.isWishlisted).toBe(true);
    expect(alpha?.releaseYear).toBeNull();
    expect(listNodes({ q: "Gamma" }).items[0]?.isWishlisted).toBe(false);
  });

  it("filters to only NSFW items", () => {
    const now = new Date();
    const nsfwId = createId();
    const safeId = createId();

    db.insert(nodes)
      .values([
        {
          id: nsfwId,
          mediaType: "GAME",
          displayName: "NSFW game",
          status: "NOT_STARTED",
          nsfw: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: safeId,
          mediaType: "GAME",
          displayName: "Safe game",
          status: "NOT_STARTED",
          nsfw: false,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    const onlyNsfw = listNodes({ onlyNsfw: true });
    expect(onlyNsfw.items.map((item) => item.id)).toEqual([nsfwId]);

    const withNsfw = listNodes({ showNsfw: true });
    expect(withNsfw.items.map((item) => item.id).sort()).toEqual(
      [nsfwId, safeId].sort(),
    );
  });
});
