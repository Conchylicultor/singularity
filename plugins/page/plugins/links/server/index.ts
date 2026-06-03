import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { blocksChanged } from "@plugins/page/plugins/editor/server";
import { reindexLinksJob } from "./internal/reindex-job";
import { backlinksResource } from "./internal/resources";

export { PageLinks } from "./internal/extractor";
export type { PageLinkExtractor } from "./internal/extractor";
export { backlinksResource } from "./internal/resources";
export { reindexDocument } from "./internal/reindex";

export default {
  name: "Page Links",
  description:
    "Backlinks index for cross-page links: page_links edge table, extractor registry, reindex, backlinks resource.",
  register: [reindexLinksJob],
  contributions: [
    Resource.Declare(backlinksResource),
    // Reindex a document's outgoing links whenever its blocks change. Declared
    // (not imperatively bound) so the events plugin's syncTriggerContributions
    // makes it idempotent across reboots. Match-any on documentId — the per-emit
    // documentId reaches the job via the event payload.
    Trigger({ on: blocksChanged, do: reindexLinksJob, with: {}, oneShot: false }),
  ],
} satisfies ServerPluginDefinition;
