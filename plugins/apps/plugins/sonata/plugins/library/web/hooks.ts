import { useCallback } from "react";
import type { LinkTarget } from "@plugins/primitives/plugins/link-gesture/core";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { sonataPlayerPane } from "./panes";

/**
 * Open a song into the player — as a link (`{ open, href }`), so the control
 * that opens it gets middle- / ⌘-click into a new browser tab. Navigates (via the pane router) to the player
 * pane at `/sonata/song/:songId`, replacing the route (`mode:"root"`) so the
 * player fills the surface. The optimistic title rides in `input` so the header
 * shows immediately. Source hydration runs in the player pane's `useResolve` hook
 * (`useSonataPlayerResolve`) — including on direct navigation / reload — so this
 * hook just opens the pane.
 *
 * Used by the gallery cards (a component, so the caller-aware context store is
 * correct). Sources' `createOption.onSelect` paths are plain data with no
 * component to host a hook — they call `openSongImperative` instead.
 */
export function useSongLink(): (song: {
  id: string;
  title: string;
}) => LinkTarget {
  const openPane = useOpenPane();
  return useCallback(
    (song) =>
      openPane.to(
        sonataPlayerPane,
        { songId: song.id },
        { mode: "root", hint: { title: song.title } },
      ),
    [openPane],
  );
}
