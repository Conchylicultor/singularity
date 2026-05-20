import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { ComponentType } from "react";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";

export interface EventRendererContribution {
  kind: JsonlEvent["kind"];
  component: ComponentType<{ event: JsonlEvent }>;
}

export interface RowActionContribution {
  id: string;
  component: ComponentType<{ event: JsonlEvent }>;
}

export interface OverlayContribution {
  id: string;
  component: ComponentType;
}

export const JsonlViewer = {
  EventRenderer: defineSlot<EventRendererContribution>(
    "conversation.jsonl-viewer.event-renderer",
    { docLabel: (p) => p.kind },
  ),
  RowAction: defineRenderSlot<RowActionContribution>(
    "conversation.jsonl-viewer.row-action",
    { docLabel: (p) => p.id },
  ),
  Overlay: defineSlot<OverlayContribution>(
    "conversation.jsonl-viewer.overlay",
    { docLabel: (p) => p.id },
  ),
};
