import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { _blocks, PAGE_BLOCK_TYPE } from "@plugins/page/plugins/editor/server";
import {
  upsertSearchDocs,
  deleteSearchDocs,
  getSourceDocMetadata,
} from "@plugins/search/plugins/engine/server";
import { buildPageSearchDoc, SOURCE } from "./reindex-page";

// Incremental boot backfill. Enumerates every `type="page"` block and reindexes
// its search doc, seeding pages that existed before this plugin shipped (the
// blocksChanged trigger only fires on future edits, never for pages already at
// rest). Enqueued once from a `defineWarmup` (deferred past serving-ready,
// throttled, worktree-scoped); `dedup: "singleton"` collapses concurrent/repeated
// enqueues to one outstanding run.
//
// SKIP-IF-UNCHANGED. The steady-state reindexer stamps a content fingerprint
// into each doc's `metadata.contentHash` (see reindex-page.ts). Before touching a
// page, we load the fingerprints of everything already indexed for this source in
// ONE query, then upsert ONLY the pages whose freshly-derived fingerprint differs
// from what is indexed. On a steady-state reboot (nothing changed since last
// boot) every page matches, so the scan issues zero writes — no tsvector regen,
// no GIN churn, no change-feed fan-out — instead of blindly re-upserting the
// entire corpus every boot.
export const backfillPagesSearchJob = defineJob({
  name: "pages.search.backfill",
  input: z.object({}).default({}),
  event: z.never(),
  dedup: "singleton",
  run: async () => {
    const pages = await db
      .select({ id: _blocks.id })
      .from(_blocks)
      .where(and(eq(_blocks.type, PAGE_BLOCK_TYPE), isNull(_blocks.deletedAt)));

    // Fingerprints of the docs already indexed for this source, keyed by pageId.
    // A page absent from this map (never indexed) has `undefined`, which can
    // never equal a computed hash — so it is always (re)indexed.
    const indexed = new Map(
      (await getSourceDocMetadata(SOURCE)).map((d) => [
        d.entityId,
        typeof d.metadata.contentHash === "string" ? d.metadata.contentHash : undefined,
      ]),
    );

    for (const page of pages) {
      const built = await buildPageSearchDoc(page.id);
      if (!built) {
        // Page block vanished between enumeration and read — wipe any stale doc.
        await deleteSearchDocs(SOURCE, [page.id]);
        continue;
      }
      if (indexed.get(page.id) === built.contentHash) continue; // unchanged — skip the write
      await upsertSearchDocs([built.doc]);
    }
  },
});
