import type { ComponentType, ReactNode } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import {
  defineDispatchSlot,
  defineRenderSlot,
} from "@plugins/primitives/plugins/slot-render/web";
import {
  defineItemActions,
  type CreateOption,
} from "@plugins/primitives/plugins/data-view/web";
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
 *  - `Source` — the source registry. Each input source (MIDI, chord-grid, …)
 *    contributes how it persists/hydrates a song, so the library stays fully
 *    source-agnostic (the collection–consumer separation). `hydrate(songId)`
 *    returns that source's client raw for the song (or `undefined` if it has
 *    none); `useOpenSong` collects every source's raw and loads them in one shot.
 *    The optional `createOption` is a data-view {@link CreateOption} — an "add a
 *    song of this source" affordance the library maps into the gallery's
 *    `creators` (a toolbar "+" menu, since there are N sources). Its `onSelect`
 *    runs fully imperatively (no React hooks): create the song, then
 *    `openSongImperative`. Adding a new source = a new contribution here, with
 *    zero library or core-schema changes.
 *  - `CardMeta` — per-card metadata strip. Contributors render a snippet given
 *    the `song` (e.g. play count / last-played, MIDI track count). Headless-friendly.
 *  - `SongActions` — trailing per-row actions for the library TABLE view
 *    (Play/Pause background playback). The gallery uses its own `SongCard` button
 *    (a custom `renderCard` bypasses `itemActions`), so this surfaces in the table.
 *  - `Sort` — gallery orderings. A dispatch slot keyed by the active sort id;
 *    the matched ordering component computes and renders the ordered grid. The
 *    built-in "Newest" is the fallback (the list is already newest-first), so
 *    play-based orderings are pure additive contributions.
 */
export const Library = {
  Source: defineSlot<{
    /** Stable id of the source (matches its `Sonata.Source` id / `rawById` key). */
    sourceId: string;
    /** This source's client raw for `songId`, or `undefined` if it has none. */
    hydrate: (songId: string) => Promise<unknown | undefined>;
    /**
     * Optional create affordance for this source, mapped by the library into the
     * data-view `creators` (toolbar "+" menu). Plain data — `onSelect` runs
     * imperatively (create + `openSongImperative`), no React hooks.
     */
    createOption?: CreateOption;
  }>("sonata.library.source", { docLabel: (c) => c.sourceId }),
  CardMeta: defineRenderSlot<{ component: ComponentType<{ song: Song }> }>(
    "sonata.library.card-meta",
    { docLabel: (p) => p.id },
  ),
  /**
   * Trailing per-row actions for the library table (Play/Pause). Minted here,
   * contributed in `web/index.ts`, and passed to the gallery/table `DataView`.
   * The gallery uses its own `SongCard` button (a custom `renderCard` bypasses
   * `itemActions`), so this surfaces in the TABLE view's trailing column.
   */
  SongActions: defineItemActions<Song>("sonata.library.song-actions"),
  Sort: defineDispatchSlot<SortOrderProps, string, { id: string; label: string }>(
    "sonata.library.sort",
    {
      key: (props) => props.activeSortId,
      fallback: NewestOrder,
      docLabel: (c) => c.label,
    },
  ),
};
