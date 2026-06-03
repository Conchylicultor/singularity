import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { Score } from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * The open timeline-marker axis. Markers (bar ticks, section bands, key flags,
 * …) are absolutely-positioned overlays anchored by a beat→fraction projector,
 * so this is a plain `defineSlot` rendered through `renderIsolated` — NOT a
 * reorderable list. The scrubber owns the generic interface and never names a
 * specific marker; adding/removing a marker plugin is zero edits here.
 */
export const SonataProgress = {
  Marker: defineSlot<{
    id: string;
    /** Render absolutely-positioned markers over the track. */
    component: ComponentType<{
      score: Score;
      /** beat → [0,1] position along the track. */
      beatToFraction: (beat: number) => number;
    }>;
  }>("sonata.progress.marker", { docLabel: (p) => p.id }),
};
