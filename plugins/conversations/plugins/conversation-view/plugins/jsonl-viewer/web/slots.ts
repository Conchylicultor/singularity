import { defineRenderSlot, defineDispatchSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { ComponentType } from "react";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { UnknownEventRow } from "./components/unknown-event-row";

export interface RowActionContribution {
  id: string;
  component: ComponentType<{ event: JsonlEvent }>;
}

export interface OverlayContribution {
  id: string;
  component: ComponentType;
}

export const JsonlViewer = {
  EventRenderer: defineDispatchSlot<{ event: JsonlEvent }, JsonlEvent["kind"]>(
    "conversation.jsonl-viewer.event-renderer",
    {
      key: (p) => p.event.kind,
      fallback: UnknownEventRow,
      docLabel: (c) => String(c.match),
    },
  ),
  RowAction: defineRenderSlot<RowActionContribution>(
    "conversation.jsonl-viewer.row-action",
    { docLabel: (p) => p.id },
  ),
  Overlay: defineRenderSlot<OverlayContribution>(
    "conversation.jsonl-viewer.overlay",
    { reorder: false, docLabel: (p) => p.id },
  ),
};
