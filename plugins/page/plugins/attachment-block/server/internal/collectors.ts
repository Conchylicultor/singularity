import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";

// Extra attachment-id collectors contributed by block plugins whose attachment
// refs don't follow the flat `data.attachmentId` / `data.attachmentIds`
// convention — e.g. a page block's nested `data.cover.attachmentId`. The shared
// reconcile unions these with the base convention. Contributors never name a
// block type here; each just returns the attachment ids it owns from a block's
// raw `data` (and returns `[]` for data it doesn't recognise).
export interface BlockAttachmentCollector {
  collect: (data: unknown) => string[];
}

export const AttachmentBlock = {
  Collector: defineServerContribution<BlockAttachmentCollector>(
    "page.attachment-block.collector",
  ),
};
