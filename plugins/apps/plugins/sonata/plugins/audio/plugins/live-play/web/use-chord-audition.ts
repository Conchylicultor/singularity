import { useCallback, useEffect, useRef } from "react";
import { useLivePlay } from "./live-store";

/** How long an auditioned chord rings before its notes are released. */
const CHORD_RING_MS = 900;

/**
 * Audition a chord through the live player: warm the voices, strike every
 * pitch together, release them after a short ring-out. Pure note-on/note-off —
 * it neither moves the playhead nor starts the song. Pending releases are
 * flushed on unmount so a ring-out never fires into a torn-down surface.
 *
 * Returns null until the live-play engine has mounted its API.
 */
export function useChordAudition():
  ((pitches: readonly number[]) => void) | null {
  const live = useLivePlay();

  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      live?.releaseAll();
    };
  }, [live]);

  const play = useCallback(
    (pitches: readonly number[]) => {
      if (!live) return;
      live.warmup();
      for (const p of pitches) live.press(p);
      const t = setTimeout(() => {
        for (const p of pitches) live.release(p);
        timersRef.current.delete(t);
      }, CHORD_RING_MS);
      timersRef.current.add(t);
    },
    [live],
  );

  return live ? play : null;
}
