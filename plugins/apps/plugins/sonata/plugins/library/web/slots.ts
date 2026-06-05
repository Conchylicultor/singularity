import type { ComponentType, ReactNode } from "react";
import {
  defineDispatchSlot,
  defineRenderSlot,
} from "@plugins/primitives/plugins/slot-render/web";
import type { Song } from "../core";
import { NewestOrder } from "./components/newest-order";

/**
 * Props an ordering component receives: the songs to order and a `render`
 * callback to hand back the ordered list. An ordering is a *component* (not a
 * plain comparator) so it can gather whatever data it needs via hooks — e.g.
 * `playback-history` reads its own live resource — without the library ever
 * importing or knowing about that data. Only the *active* ordering is rendered
 * (via the dispatch slot), so its hooks run exactly once (rules-of-hooks safe).
 */
export interface SortOrderProps {
  activeSortId: string;
  songs: Song[];
  render: (ordered: Song[]) => ReactNode;
}

/**
 * Extension seams the song library exposes:
 *
 *  - `CardMeta` — per-card metadata strip. Contributors render a snippet given
 *    the `song` (e.g. play count / last-played). Headless-friendly.
 *  - `Sort` — gallery orderings. A dispatch slot keyed by the active sort id;
 *    the matched ordering component computes and renders the ordered grid. The
 *    built-in "Newest" is the fallback (the list is already newest-first), so
 *    play-based orderings are pure additive contributions.
 */
export const Library = {
  CardMeta: defineRenderSlot<{ component: ComponentType<{ song: Song }> }>(
    "sonata.library.card-meta",
    { reorder: false, docLabel: (p) => p.id },
  ),
  Sort: defineDispatchSlot<SortOrderProps, string, { id: string; label: string }>(
    "sonata.library.sort",
    {
      key: (props) => props.activeSortId,
      fallback: NewestOrder,
      docLabel: (c) => c.label,
    },
  ),
};
