import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { JsonlEvent } from "../shared";

export interface EventRendererContribution {
  kind: JsonlEvent["kind"];
  component: ComponentType<{ event: JsonlEvent; markdownMode?: boolean }>;
}

// Action buttons rendered in a unified hover strip on every event row.
// Component receives the row's event and may return null to opt out for
// kinds it doesn't apply to.
export interface RowActionContribution {
  id: string;
  component: ComponentType<{ event: JsonlEvent }>;
}

export const JsonlViewer = {
  EventRenderer: defineSlot<EventRendererContribution>(
    "conversation.jsonl-viewer.event-renderer",
  ),
  RowAction: defineSlot<RowActionContribution>(
    "conversation.jsonl-viewer.row-action",
  ),
};
