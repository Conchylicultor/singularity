import { useCallback } from "react";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { sonataPlayerPane } from "./panes";

/**
 * Open a song into the player. Navigates (via the pane router) to the player
 * pane at `/sonata/song/:songId`, replacing the route (`mode:"root"`) so the
 * player fills the surface. The optimistic title rides in `input` so the header
 * shows immediately. Source hydration runs in the player pane's `resolve` hook
 * (`useSonataPlayerResolve`) — including on direct navigation / reload — so this
 * hook just opens the pane.
 *
 * Used by the gallery cards (a component, so the caller-aware context store is
 * correct). Sources' `createOption.onSelect` paths are plain data with no
 * component to host a hook — they call `openSongImperative` instead.
 */
export function useOpenSong(): (song: { id: string; title: string }) => void {
  const openPane = useOpenPane();
  return useCallback(
    (song) => {
      openPane(
        sonataPlayerPane,
        { songId: song.id },
        { mode: "root", input: { title: song.title } },
      );
    },
    [openPane],
  );
}
