import { useMemo } from "react";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useSurfaceShortcuts } from "@plugins/primitives/plugins/shortcuts/web";
import { TEMPO_STEP } from "../shortcuts";

/**
 * Headless transport-shortcut registrar (a `Sonata.Effect`, so it mounts once
 * per Sonata surface inside `SonataProvider`, with `useSonata()` in scope).
 *
 * It registers Space / ↑ / ↓ as SURFACE-SCOPED shortcuts via
 * `useSurfaceShortcuts` — each handler closes over THIS surface's own transport
 * verbs, and the shortcut fires only while this surface is the focused one. That
 * is what fixes the cross-window bug: with two Sonata windows open, Space in one
 * toggles only that one.
 *
 * The old module-level transport bus gave an implicit "player on screen" gate
 * (it was empty on the library). `SonataProvider` wraps BOTH library and player,
 * so that gate is gone — we restore it explicitly by registering NO shortcuts
 * (an empty array) until a song is open (`currentSongId != null`), leaving
 * Space/arrows to the rest of the app on the library.
 */
export function TransportShortcuts() {
  const { togglePlay, nudgeTempo, currentSongId } = useSonata();
  const descriptors = useMemo(
    () =>
      currentSongId == null
        ? []
        : [
            {
              id: "sonata.play-pause",
              keys: "space",
              label: "Play / pause",
              group: "Sonata",
              handler: () => togglePlay(),
            },
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
    [currentSongId, togglePlay, nudgeTempo],
  );
  useSurfaceShortcuts(descriptors);
  return null;
}
