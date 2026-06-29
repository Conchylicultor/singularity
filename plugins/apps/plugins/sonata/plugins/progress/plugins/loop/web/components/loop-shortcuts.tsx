import { useMemo } from "react";
import { scoreEndBeat } from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  useSonata,
  useCursorApi,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useSurfaceShortcuts } from "@plugins/primitives/plugins/shortcuts/web";
import { toggleLoop } from "../loop-actions";

/**
 * Headless A–B-loop keyboard registrar (a `Sonata.Effect`, mirroring controls'
 * `TransportShortcuts`): surface-scoped, focus-gated shortcuts that fire only
 * while THIS Sonata surface is focused, and only while a song is open
 * (`currentSongId != null`) so they stay inert on the library.
 *
 *  - `L` — toggle the loop (create the default region + seek, or flip enabled).
 *  - `[` — set the loop start (A) at the playhead, enabling the loop.
 *  - `]` — set the loop end (B) at the playhead, enabling the loop.
 *
 * `[`/`]` go through `setLoop`, whose clamp + min-gap protect against inversion
 * (e.g. setting A past B). It lives in the loop plugin (not controls) so the
 * whole feature stays atomic.
 */
export function LoopShortcuts() {
  const { currentSongId, loop, setLoop, seekTo, score } = useSonata();
  const cursor = useCursorApi();

  const descriptors = useMemo(
    () =>
      currentSongId == null
        ? []
        : [
            {
              id: "sonata.loop-toggle",
              keys: "l",
              label: "Toggle loop",
              group: "Sonata",
              handler: () =>
                toggleLoop({
                  loop,
                  setLoop,
                  seekTo,
                  score,
                  beat: cursor.getBeat(),
                }),
            },
            {
              id: "sonata.loop-start",
              keys: "[",
              label: "Set loop start",
              group: "Sonata",
              handler: () =>
                setLoop({
                  start: cursor.getBeat(),
                  // Default B to the song end (not the playhead) so a lone `[`
                  // gives a usable A→end range instead of collapsing to the
                  // min-gap; a later `]` then trims B to the passage's end.
                  end: loop?.end ?? scoreEndBeat(score),
                  enabled: true,
                }),
            },
            {
              id: "sonata.loop-end",
              keys: "]",
              label: "Set loop end",
              group: "Sonata",
              handler: () =>
                // Default A to the song start so a lone `]` gives a usable
                // start→B range (symmetric with `[`).
                setLoop({
                  start: loop?.start ?? 0,
                  end: cursor.getBeat(),
                  enabled: true,
                }),
            },
          ],
    [currentSongId, loop, setLoop, seekTo, score, cursor],
  );

  useSurfaceShortcuts(descriptors);
  return null;
}
