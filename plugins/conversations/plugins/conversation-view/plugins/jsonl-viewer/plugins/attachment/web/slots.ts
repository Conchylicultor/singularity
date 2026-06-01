import { defineDispatchSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { AttachmentRendererProps } from "../core";
import { GenericAttachmentView } from "./components/generic-attachment-view";

export const JsonlViewerAttachment = {
  Renderer: defineDispatchSlot<AttachmentRendererProps, string>(
    "conversation.jsonl-viewer.attachment-renderer",
    {
      key: (p) => p.event.subtype,
      fallback: GenericAttachmentView,
      docLabel: (c) =>
        typeof c.match === "string" ? c.match : c.match.source,
    },
  ),
};
