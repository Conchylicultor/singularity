import { defineRenderSlot, defineDispatchSlot } from "@plugins/primitives/plugins/slot-render/web";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { UnknownEventRow } from "./components/unknown-event-row";
import { PendingContentIndicator } from "./components/pending-content-indicator";

export interface RowActionContribution {
  id: string;
  component: ComponentType<{ event: JsonlEvent }>;
}

export interface OverlayContribution {
  id: string;
  component: ComponentType;
}

/**
 * Logic-only contribution: a predicate that, when it returns true for an event,
 * removes that event from the rendered JSONL flow. Generic — contributors own
 * the rule (e.g. suppress a raw answer turn already shown inside a card). This
 * is a behavior slot (no component), so it is read directly via
 * `.useContributions()` rather than rendered through Dispatch/Render — the
 * EventRenderer's predicate tier can't win when another plugin already owns the
 * exact event-kind key.
 */
export interface EventFilterContribution {
  id: string;
  hide: (event: JsonlEvent) => boolean;
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
  PendingPrompt: defineDispatchSlot<{ conversationId: string; waitingFor: string }, string>(
    "conversation.jsonl-viewer.pending-prompt",
    {
      key: (p) => p.waitingFor,
      fallback: PendingContentIndicator,
      docLabel: (c) => String(c.match),
    },
  ),
  EventFilter: defineSlot<EventFilterContribution>(
    "conversation.jsonl-viewer.event-filter",
    { docLabel: (p) => p.id },
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
