import { and, eq, inArray } from "drizzle-orm";

import { db } from "../lib/db/client";
import { externalRefs, nodes } from "../lib/db/schema";
import { parseJson } from "../lib/helpers";
import { isSteamNsfw } from "../lib/providers/steam";

function main() {
  const refs = db
    .select({
      nodeId: externalRefs.nodeId,
      sourceData: externalRefs.sourceData,
    })
    .from(externalRefs)
    .where(eq(externalRefs.provider, "steam"))
    .all();

  const matchingIds = new Set<string>();

  for (const ref of refs) {
    const data = parseJson<{ details?: Record<string, unknown> }>(
      ref.sourceData,
      {},
    );
    for (const [, entry] of Object.entries(data.details ?? {})) {
      const app = entry as { data?: unknown } | null;
      if (
        app?.data &&
        isSteamNsfw(app.data as Parameters<typeof isSteamNsfw>[0])
      ) {
        matchingIds.add(ref.nodeId);
      }
    }
  }

  if (!matchingIds.size) {
    console.log("Steam NSFW backfill: no matching items.");
    return;
  }

  const changed = db
    .update(nodes)
    .set({ nsfw: true })
    .where(and(inArray(nodes.id, [...matchingIds]), eq(nodes.nsfw, false)))
    .run();

  console.log(
    `Steam NSFW backfill: ${matchingIds.size} matching items, ${changed.changes} marked NSFW.`,
  );
}

void main();
