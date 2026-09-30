import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { defineWarmup } from "@plugins/infra/plugins/warmup/server";
import {
  liveBlocks,
  PAGE_BLOCK_TYPE,
} from "@plugins/page/plugins/editor/server";
import { _pageBlocksAutoIconExt } from "./tables";
import { autoIconJob } from "./auto-icon-job";

// Seeds icons for pages that predate the `blocksChanged` subscriber: every live
// page with no provenance row. `dedup: "singleton"` collapses repeated enqueues;
// the scan only enqueues — the keyed, serial `pages.auto-icon.generate` job does
// the model calls one at a time. A page the thin-content gate skips gets no row,
// so it is enqueued again on the next boot (a cheap no-model read).
export const backfillAutoIconsJob = defineJob({
  name: "pages.auto-icon.backfill",
  // instant: one indexed read and N queue inserts — no model call here.
  hold: "instant",
  input: z.object({}).default({}),
  event: z.never(),
  dedup: "singleton",
  run: async () => {
    const rows = await db
      .select({ id: liveBlocks.id })
      .from(liveBlocks)
      .leftJoin(
        _pageBlocksAutoIconExt,
        eq(_pageBlocksAutoIconExt.blockId, liveBlocks.id),
      )
      .where(
        and(
          eq(liveBlocks.type, PAGE_BLOCK_TYPE),
          isNull(_pageBlocksAutoIconExt.blockId),
        ),
      );
    for (const { id } of rows) await autoIconJob.enqueue({ pageId: id });
  },
});

// A declared warm-up rather than an `onReady` enqueue: deferred past
// serving-ready and throttled. `worktree` scope — pages live in each backend's
// own DB; a fork inherits main's provenance rows, so it seeds only what main
// has not.
export const autoIconsBackfillWarmup = defineWarmup({
  name: "pages.auto-icon.backfill",
  scope: "worktree",
  run: async () => {
    await backfillAutoIconsJob.enqueue({});
  },
});
