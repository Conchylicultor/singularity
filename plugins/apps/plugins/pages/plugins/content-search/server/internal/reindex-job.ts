import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { reindexPageSearch } from "./reindex-page";

// Event-driven reindex. Bound to the editor's `page.blocksChanged` trigger via
// `Trigger({ on: blocksChanged, do: reindexPageSearchJob, with: {} })` — the
// per-emit `pageId` arrives through the `event` payload (the trigger's `with`
// is fixed at registration time, so it can't carry it). `dedup: "none"`:
// graphile may retry, but `reindexPageSearch` is idempotent (replace-on-conflict
// upsert).
export const reindexPageSearchJob = defineJob({
  name: "pages.search.reindex",
  input: z.object({}).default({}),
  event: z.object({ pageId: z.string() }),
  dedup: "none",
  run: async ({ event }) => {
    if (!event) return;
    await reindexPageSearch(event.pageId);
  },
});
