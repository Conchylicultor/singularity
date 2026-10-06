import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * The Sonata APP's own state — which library song the app shows as open —
 * as opposed to what any player holds (the loaded document, the transport:
 * see the player scope). A song played in the background from the library is
 * the open song while no player shows it.
 */
export interface SonataAppValue {
  /** Id of the song currently open in the app (null when none is). Lets
   *  app-scoped effects attribute a play to a specific song. */
  currentSongId: string | null;
  /**
   * Monotonic counter bumped on every `setCurrentSong` call — including reopening
   * the *same* song. Effects that should fire once per open (e.g. recording a play
   * on the first Play press) key their "already handled" guard on this so a fresh
   * open re-arms them while pause→resume within one open does not. Each player
   * open is a fresh `mode:"root"` pane instance, so the player surface's mount
   * effect calls `setCurrentSong` exactly once per open.
   */
  songOpenEpoch: number;
  /**
   * Mark a song as the one currently open: sets `currentSongId` and bumps
   * `songOpenEpoch` (re-arms once-per-open effects, even for the same song).
   * Takes a bare id: the title is library-owned (the library's `songs` value,
   * read via `useCurrentSong`), never mirrored here — a bare id cannot be
   * fabricated. It touches neither the content nor the settings: those belong
   * to the document the player loaded.
   */
  setCurrentSong: (songId: string) => void;
  /**
   * Clear the open-song state (nulls `currentSongId`). Called by the player
   * surface on unmount so app effects don't mis-attribute a play to a song
   * that is no longer on screen. The loaded document may play on in the
   * background, its settings in force over it.
   */
  clearCurrentSong: () => void;
}

const SonataAppContext = createContext<SonataAppValue | null>(null);

/** Read the Sonata app state. Throws outside `<SonataAppProvider>`. */
export function useSonataApp(): SonataAppValue {
  const ctx = useContext(SonataAppContext);
  if (!ctx) {
    throw new Error("useSonataApp must be used within <SonataAppProvider>");
  }
  return ctx;
}

export function SonataAppProvider({ children }: { children: ReactNode }) {
  // Navigation itself is URL-driven via the pane router (the library index pane
  // and the player pane); this only tracks which song the player surface
  // currently has on screen, so app-scoped effects can attribute playback to it.
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [songOpenEpoch, setSongOpenEpoch] = useState(0);

  const setCurrentSong = useCallback((songId: string) => {
    setCurrentSongId(songId);
    // Bump every open (even the same song) so once-per-open effects re-arm.
    setSongOpenEpoch((n) => n + 1);
  }, []);

  const clearCurrentSong = useCallback(() => {
    setCurrentSongId(null);
  }, []);

  const value = useMemo<SonataAppValue>(
    () => ({ currentSongId, songOpenEpoch, setCurrentSong, clearCurrentSong }),
    [currentSongId, songOpenEpoch, setCurrentSong, clearCurrentSong],
  );

  return (
    <SonataAppContext.Provider value={value}>
      {children}
    </SonataAppContext.Provider>
  );
}
