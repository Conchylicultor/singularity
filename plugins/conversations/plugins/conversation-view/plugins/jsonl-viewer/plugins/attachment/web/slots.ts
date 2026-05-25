import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";
import type { AttachmentRendererProps } from "../core";

export interface AttachmentRendererContribution {
  subtype: string;
  component: ComponentType<AttachmentRendererProps>;
}

export const JsonlViewerAttachment = {
  Renderer: defineSlot<AttachmentRendererContribution>(
    "conversation.jsonl-viewer.attachment-renderer",
    { docLabel: (p) => p.subtype },
  ),
};
