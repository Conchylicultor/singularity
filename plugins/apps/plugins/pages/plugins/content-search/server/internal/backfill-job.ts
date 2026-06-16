import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { _blocks, PAGE_BLOCK_TYPE } from "@plugins/page/plugins/editor/server";
import { reindexPageSearch } from "./reindex-page";

// One-shot boot backfill. Enumerates every `type="page"` block and reindexes its
// search doc, seeding pages that existed before this plugin shipped (the
// blocksChanged trigger only fires on future edits, never for pages already at
// rest). Enqueued once from the server barrel's `onReady`; `dedup: "singleton"`
// collapses concurrent/repeated boot enqueues to one outstanding run. Each
// reindex is a diff-free upsert, so re-running on a later boot is harmless.
export const backfillPagesSearchJob = defineJob({
  name: "pages.search.backfill",
  input: z.object({}).default({}),
  event: z.never(),
  dedup: "singleton",
  run: async () => {
    const pages = await db
      .select({ id: _blocks.id })
      .from(_blocks)
      .where(eq(_blocks.type, PAGE_BLOCK_TYPE));
    for (const page of pages) {
      await reindexPageSearch(page.id);
    }
  },
});
