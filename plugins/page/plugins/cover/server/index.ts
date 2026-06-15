import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { AttachmentBlock } from "@plugins/page/plugins/attachment-block/server";
import { collectCoverAttachmentIds } from "./internal/collector";

export default {
  description:
    "Links a page's cover image: registers the cover attachment-id collector with the shared block↔attachment reconcile so the cover isn't orphan-swept.",
  contributions: [AttachmentBlock.Collector({ collect: collectCoverAttachmentIds })],
} satisfies ServerPluginDefinition;
