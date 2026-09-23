import { useEffect, useRef, useState } from "react";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";

/** How often a drag may save, in ms: often enough that the sound moves with the thumb. */
const WRITE_INTERVAL_MS = 100;

/**
 * A fader over a saved level: the thumb follows the pointer from a local
 * draft, the save is throttled leading + trailing (a trailing-only debounce
 * would never fire during a continuous drag), and the draft is held until the
 * saved value comes back as the last one sent — so the thumb neither lags a
 * round trip nor snaps back while the write is in flight. A saved value this
 * fader did not send is adopted at once.
 *
 * The same policy as Sonata's `useTrackFader`, for one number with no
 * per-track keys.
 */
export function useLevelFader(
  persisted: number,
  save: (value: number) => void,
): { value: number; onValueChange: (next: number) => void } {
  const [draft, setDraft] = useState<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const sentRef = useRef<Set<number>>(new Set());
  const lastSentRef = useRef<number | null>(null);
  const lastWriteAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const write = useEventCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
    const value = pendingRef.current;
    if (value === null || value === lastSentRef.current) return;
    lastWriteAtRef.current = performance.now();
    lastSentRef.current = value;
    sentRef.current.add(value);
    save(value);
  });

  const onValueChange = useEventCallback((next: number) => {
    setDraft(next);
    pendingRef.current = next;
    if (timerRef.current !== undefined) return;
    const since = performance.now() - lastWriteAtRef.current;
    if (since >= WRITE_INTERVAL_MS) write();
    else timerRef.current = setTimeout(write, WRITE_INTERVAL_MS - since);
  });

  // A move made just before unmount is still a move the user made.
  useEffect(
    () => () => {
      if (timerRef.current !== undefined) write();
    },
    [write],
  );

  useEffect(() => {
    const ours = sentRef.current.has(persisted);
    const settled =
      persisted === lastSentRef.current &&
      pendingRef.current === lastSentRef.current;
    if (ours && !settled) return;
    sentRef.current.clear();
    lastSentRef.current = null;
    pendingRef.current = null;
    setDraft(null);
  }, [persisted]);

  return { value: draft ?? persisted, onValueChange };
}
