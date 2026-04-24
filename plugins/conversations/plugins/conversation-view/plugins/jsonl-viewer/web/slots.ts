import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { JsonlEvent } from "../shared";

export interface EventRendererContribution {
  kind: JsonlEvent["kind"];
  component: ComponentType<{ event: JsonlEvent; markdownMode?: boolean }>;
}

export const JsonlViewer = {
  EventRenderer: defineSlot<EventRendererContribution>(
    "conversation.jsonl-viewer.event-renderer",
  ),
};
