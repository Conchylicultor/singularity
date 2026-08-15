import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { ComponentType } from "react";

export interface TranscriptStatContribution {
  id: string;
  component: ComponentType;
}

export const TranscriptStats = {
  /**
   * One reading of the transcript, shown in the strip at the foot of the pane.
   *
   * Contributions take no props — like every other slot in this pane, they read
   * their own context: `useTranscriptRead()` hands them the transcript **as far
   * as the reader has scrolled**, and each stat is a pure fold over it. That is
   * the whole contract: a stat never touches the scroller, the resource, or the
   * filter set, and it gets its scroll-anchored behaviour for free.
   */
  Item: defineRenderSlot<TranscriptStatContribution>(
    "conversation.jsonl-viewer.transcript-stat",
    { docLabel: (p) => p.id },
  ),
};
