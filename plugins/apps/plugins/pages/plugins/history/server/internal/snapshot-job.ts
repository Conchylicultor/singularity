import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { recordVersion } from "@plugins/history/plugins/engine/server";

/**
 * The keyed snapshot job: captures one time-bucketed version of a page. The
 * `dedup: { key: pageId }` gives it a graphile job_key — so the scheduler's
 * repeated `enqueue(..., { runAt })` during an edit burst REPLACES the pending
 * row, collapsing the whole burst into a single run ~4s after the last edit.
 * `recordVersion`'s 10-minute window then does the Notion-style coalescing.
 */
export const pageSnapshotJob = defineJob({
  name: "pages.history.snapshot",
  input: z.object({ pageId: z.string() }),
  event: z.never(),
  dedup: { key: ({ pageId }) => pageId },
  run: async ({ input }) => {
    await recordVersion("pages", input.pageId);
  },
});
