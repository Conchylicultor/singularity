import type { IconRef } from "@plugins/ui/plugins/icons/core";
import type { ComponentType } from "react";
import {
  defineDispatchSlot,
  defineRenderSlot,
} from "@plugins/primitives/plugins/slot-render/web";
import type {
  Capability,
  Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { NoDisplay } from "./components/no-display";

/**
 * What a player shows: the lenses over the session's score and the strip
 * that navigates it. Owned here, by the player, because the player parts
 * render them (`PlayerDisplay`, `PlayerTransport`) for any host — the Sonata
 * app and a preview alike — and the player sits below the app shell.
 */
export const SonataPlayer = {
  // DISPLAY — single-active selector; a display *is* one component. `Extra`
  // carries the metadata the picker enumerates (collection-consumer clean —
  // never names a contributor). The dispatch key is the display id, carried in
  // the render props so the player view stays the single owner of the
  // selection. The playback cursor is NOT a prop — displays read it from the
  // session's cursor store (`useCursorSelector` / `useCursorApi().subscribe`)
  // so a per-frame advance never re-renders the dispatch site.
  Display: defineDispatchSlot<
    {
      score: Score;
      /** Playback tempo multiplier (1 = authored). Displays scale scroll speed by
       *  this so slowing down slows the scroll instead of stretching notes. */
      tempoScale: number;
      activeDisplayId: string;
    },
    string,
    {
      id: string;
      label: string;
      icon?: IconRef;
      capabilities: Capability[];
      /** The lens selected when none is chosen (exactly one; falls back to the
       *  first contribution). Collection-consumer clean — consumers pick the
       *  default-flagged display, never naming a contributor. */
      default?: boolean;
    }
  >({
    key: (props) => props.activeDisplayId,
    fallback: NoDisplay,
    docLabel: (c) => c.label,
  }),

  // TRANSPORT — full-width horizontal strip that navigates the song (the
  // progress scrubber, …), painted by `PlayerTransport`.
  Transport: defineRenderSlot<{ component: ComponentType }>({
    docLabel: (p) => p.id,
  }),
};
