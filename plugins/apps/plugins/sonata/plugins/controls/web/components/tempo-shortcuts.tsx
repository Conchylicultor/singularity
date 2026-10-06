import { useMemo } from "react";
import { useSession } from "@plugins/apps/plugins/sonata/plugins/session/web";
import { useSonataApp } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useSurfaceShortcuts } from "@plugins/primitives/plugins/shortcuts/web";
import { TEMPO_STEP } from "../shortcuts";

/**
 * ↑ / ↓ nudge the tempo — a `Sonata.Effect`, app-only: the tempo control and
 * readout live in Sonata's transport bar, so in a host without them (a file
 * preview) the keys would change the speed invisibly. (Space and ←/→ belong to
 * every shown player — see `PlayPauseShortcut` / `SeekHoldController`.)
 *
 * Surface-scoped via `useSurfaceShortcuts`, so ↑/↓ in one Sonata window drives
 * only its own transport, and registered only while a song is open
 * (`currentSongId != null`) so the arrows stay with the rest of the app on the
 * library.
 */
export function TempoShortcuts() {
  const { nudgeTempo } = useSession();
  const { currentSongId } = useSonataApp();
  const descriptors = useMemo(
    () =>
      currentSongId == null
        ? []
        : [
            {
              id: "sonata.tempo-up",
              keys: "arrowup",
              label: "Speed up",
              group: "Sonata",
              handler: () => nudgeTempo(TEMPO_STEP),
            },
            {
              id: "sonata.tempo-down",
              keys: "arrowdown",
              label: "Slow down",
              group: "Sonata",
              handler: () => nudgeTempo(-TEMPO_STEP),
            },
          ],
    [currentSongId, nudgeTempo],
  );
  useSurfaceShortcuts(descriptors);
  return null;
}
