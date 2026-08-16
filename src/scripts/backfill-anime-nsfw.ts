import { and, eq, inArray } from "drizzle-orm";

import { db } from "../lib/db/client";
import { nodeAttributes, nodes } from "../lib/db/schema";
import { getEnv } from "../lib/env";

function main() {
  const nsfwGenres = getEnv().nsfwGenres;

  if (!nsfwGenres.length) {
    console.log(
      "Anime NSFW backfill: no genres configured (NSFW_GENRES is empty).",
    );
    return;
  }

  const matchingIds = db
    .select({ id: nodes.id })
    .from(nodes)
    .innerJoin(nodeAttributes, eq(nodeAttributes.nodeId, nodes.id))
    .where(
      and(
        eq(nodes.mediaType, "ANIME"),
        eq(nodeAttributes.key, "genre"),
        inArray(nodeAttributes.value, nsfwGenres),
      ),
    )
    .all()
    .map((row) => row.id);

  if (!matchingIds.length) {
    console.log("Anime NSFW backfill: no matching items.");
    return;
  }

  const changed = db
    .update(nodes)
    .set({ nsfw: true })
    .where(and(inArray(nodes.id, matchingIds), eq(nodes.nsfw, false)))
    .run();

  console.log(
    `Anime NSFW backfill: ${matchingIds.length} matching items, ${changed.changes} marked NSFW.`,
  );
}

void main();
