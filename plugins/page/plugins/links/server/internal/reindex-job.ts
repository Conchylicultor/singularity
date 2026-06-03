import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { reindexDocument } from "./reindex";

// Event-driven reindex. Bound to the editor's `page.blocksChanged` trigger via
// `trigger({ on: blocksChanged, do: reindexLinksJob, with: {} })` — the
// per-emit `documentId` arrives through the `event` payload (the trigger's
// `with` is fixed at registration time, so it can't carry it). `dedup: "none"`:
// graphile may retry, but `reindexDocument` is idempotent (diff-based).
export const reindexLinksJob = defineJob({
  name: "page.links.reindex",
  input: z.object({}).default({}),
  event: z.object({ documentId: z.string() }),
  dedup: "none",
  run: async ({ event }) => {
    if (!event) return;
    await reindexDocument(event.documentId);
  },
});
