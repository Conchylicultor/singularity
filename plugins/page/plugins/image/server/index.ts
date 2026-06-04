import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { blocksChanged } from "@plugins/page/plugins/editor/server";
import { reconcileImageAttachmentsJob } from "./internal/reconcile-job";

export default {
  name: "Image Block (server)",
  description:
    "Links image-block attachments to their page_blocks rows on every blocksChanged emit; FK cascade reclaims on delete.",
  register: [reconcileImageAttachmentsJob],
  contributions: [
    // Reconcile a document's image-block links whenever its blocks change.
    // Declared (not imperatively bound) so syncTriggerContributions makes it
    // idempotent across reboots. Match-any on documentId — the per-emit
    // documentId reaches the job via the event payload.
    Trigger({ on: blocksChanged, do: reconcileImageAttachmentsJob, with: {}, oneShot: false }),
  ],
} satisfies ServerPluginDefinition;
