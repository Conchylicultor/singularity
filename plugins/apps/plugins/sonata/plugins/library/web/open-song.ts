import { openPane } from "@plugins/primitives/plugins/pane/web";
import { sonataPlayerPane } from "./panes";

/**
 * Imperative counterpart to {@link useOpenSong}: open a song into the player
 * without a React hook. Used from `CreateOption.onSelect` paths (each source's
 * create affordance), which run as plain data — no component to host
 * `useOpenPane`. Writes directly to the live pane store via the imperative
 * `openPane` (vs. the `useOpenPane` hook's caller-aware context store); for a
 * click in the visible library the two coincide. Mirrors `useOpenSong`'s open
 * call exactly: `mode:"root"` replaces the route with the player and the
 * optimistic title rides in `input` so the header shows immediately. Source
 * hydration runs in the player pane's `resolve` hook (`useSonataPlayerResolve`).
 */
export function openSongImperative(song: { id: string; title: string }): void {
  openPane(
    sonataPlayerPane,
    { songId: song.id },
    { mode: "root", hint: { title: song.title } },
  );
}
