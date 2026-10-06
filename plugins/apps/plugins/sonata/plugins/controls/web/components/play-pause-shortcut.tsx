import { useMemo } from "react";
import { useSession } from "@plugins/apps/plugins/sonata/plugins/session/web";
import { useSurfaceShortcuts } from "@plugins/primitives/plugins/shortcuts/web";

/**
 * Space toggles play/pause — a `SonataPlayer.Effect`, so it is registered once
 * per player while that player is SHOWN (a `PlayerDisplay` is mounted): the
 * Sonata app's player pane and a file preview alike, never the library's
 * now-playing bar.
 *
 * Surface-scoped via `useSurfaceShortcuts`: it fires only while this player's
 * surface is the focused one, and the handler closes over THIS player's
 * session, so Space in one window (or preview) never drives another. It yields
 * to a text field (`targetClaimsKey`) and to any element that already handled
 * the key (the shortcut manager skips a `defaultPrevented` event).
 */
export function PlayPauseShortcut() {
  const { togglePlay } = useSession();
  const descriptors = useMemo(
    () => [
      {
        id: "sonata.play-pause",
        keys: "space",
        label: "Play / pause",
        group: "Sonata",
        handler: () => togglePlay(),
      },
    ],
    [togglePlay],
  );
  useSurfaceShortcuts(descriptors);
  return null;
}
