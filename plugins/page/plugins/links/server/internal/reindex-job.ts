import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { reindexPage } from "./reindex";

// Event-driven reindex. Bound to the editor's `page.blocksChanged` trigger via
// `trigger({ on: blocksChanged, do: reindexLinksJob, with: {} })` — the
// per-emit `pageId` arrives through the `event` payload (the trigger's `with` is
// fixed at registration time, so it can't carry it). `dedup: "none"`: graphile
// may retry, but `reindexPage` is idempotent (diff-based).
export const reindexLinksJob = defineJob({
  name: "page.links.reindex",
  input: z.object({}).default({}),
  event: z.object({ pageId: z.string() }),
  dedup: "none",
  run: async ({ event }) => {
    if (!event) return;
    await reindexPage(event.pageId);
  },
});
