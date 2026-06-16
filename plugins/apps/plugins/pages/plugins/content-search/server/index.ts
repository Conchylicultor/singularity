import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { blocksChanged, BlockLifecycle } from "@plugins/page/plugins/editor/server";
import { reindexPageSearchJob } from "./internal/reindex-job";
import { backfillPagesSearchJob } from "./internal/backfill-job";
import { deletePagesSearchHook } from "./internal/delete-hook";

export default {
  description:
    "Pages full-text search consumer: indexes pages into the search engine, reindexing on blocksChanged and seeding existing pages via a one-shot boot backfill.",
  register: [reindexPageSearchJob, backfillPagesSearchJob],
  contributions: [
    // Reindex a page's search doc whenever its blocks change. Declared (not
    // imperatively bound) so the events plugin makes it idempotent across
    // reboots. Match-any on pageId — the per-emit pageId reaches the job via
    // the event payload.
    Trigger({ on: blocksChanged, do: reindexPageSearchJob, with: {}, oneShot: false }),
    // A page delete FK-cascades its blocks without firing the reindexer for the
    // page itself; drop its stale search doc.
    BlockLifecycle.BeforeDelete(deletePagesSearchHook),
  ],
  // Seed pages that predate this plugin. Runs once the DB + registry are ready;
  // `dedup: "singleton"` keeps repeated boots to one outstanding backfill.
  onReady: async () => {
    await backfillPagesSearchJob.enqueue({});
  },
} satisfies ServerPluginDefinition;
