import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { blocksChanged, BlockLifecycle } from "@plugins/page/plugins/editor/server";
import { reindexLinksJob } from "./internal/reindex-job";
import { backlinksResource } from "./internal/resources";
import {
  backlinksDeleteHook,
  backlinksTrashHook,
  backlinksRestoreHook,
} from "./internal/delete-hook";

export { PageLinks } from "./internal/extractor";
export type { PageLinkExtractor } from "./internal/extractor";
export { backlinksResource } from "./internal/resources";
export { reindexPage } from "./internal/reindex";

export default {
  description:
    "Backlinks index for cross-page links: page_links edge table, extractor registry, reindex, backlinks resource.",
  register: [reindexLinksJob],
  contributions: [
    Resource.Declare(backlinksResource),
    // Reindex a page's outgoing links whenever its blocks change. Declared (not
    // imperatively bound) so the events plugin's syncTriggerContributions makes
    // it idempotent across reboots. Match-any on pageId — the per-emit pageId
    // reaches the job via the event payload.
    Trigger({ on: blocksChanged, do: reindexLinksJob, with: {}, oneShot: false }),
    // Re-push the backlinks panels of pages a deleted subtree linked to: the FK
    // cascade wipes those page_links edges without going through the reindexer.
    BlockLifecycle.BeforeDelete(backlinksDeleteHook),
    // A TRASH never cascades, so a trashed page's outgoing edges must be dropped
    // explicitly; restore rebuilds them.
    BlockLifecycle.OnTrash(backlinksTrashHook),
    BlockLifecycle.OnRestore(backlinksRestoreHook),
  ],
} satisfies ServerPluginDefinition;
