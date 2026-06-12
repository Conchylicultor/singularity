import { useRef, useSyncExternalStore, type DependencyList } from "react";

/**
 * The playback cursor (playhead position in quarter-note beats) as a module-level
 * store rather than React context state.
 *
 * The transport advances the cursor ~60×/sec from a `requestAnimationFrame` loop.
 * Holding it in `SonataContextValue` would mint a new context object every frame
 * and re-render EVERY `useSonata()` consumer — including ones that only forward
 * the cursor to an imperative handle (the Pixi piano-roll scene, the audio
 * scheduler) or whose output changes only at region boundaries (the key/chord
 * HUD). Keeping it here lets each consumer opt into exactly the read path it
 * needs and leaves the context value identity-stable during playback (so
 * non-readers stop re-rendering entirely).
 *
 * Three read paths:
 *  - {@link subscribeCursor} / {@link getCursorBeat} — imperative; drive a scene
 *    handle or DOM transform directly with ZERO React renders.
 *  - {@link useCursorBeat} — raw reactive; re-renders the caller every frame
 *    (for consumers whose output genuinely changes per frame).
 *  - {@link useCursorSelector} — derived-with-bailout; re-renders only when the
 *    selected value changes (for frame-invariant HUD/readout consumers).
 *
 * Mirrors the `audio-store` / `transport-store` module-store precedent: one
 * Sonata app mounts at a time, so a singleton is correct (no per-instance state).
 * Only the provider writes; everyone else reads.
 */

let cursorBeat = 0;
const listeners = new Set<(seek: boolean) => void>();

/** Imperative / snapshot read of the current cursor beat. */
export function getCursorBeat(): number {
  return cursorBeat;
}

/**
 * Move the playhead. Only `SonataProvider` calls this (rAF loop, seek, scrub,
 * score-change reset). Early-returns on an unchanged beat (unless it's a seek)
 * so `getCursorBeat`'s value is referentially stable while the store hasn't
 * moved — required for the `useSyncExternalStore` tearing check not to loop.
 *
 * `seek: true` marks a jump (seek / scrub / score reset) as opposed to a smooth
 * playback advance. Imperative onset-driven consumers (the piano-roll scene)
 * re-anchor on a seek instead of firing every onset between the old and new
 * position — navigation must not spray note-strike FX. It's threaded through the
 * subscription callback rather than inferred, because the synchronous store
 * write reaches imperative subscribers BEFORE React commits any `seekEpoch`.
 */
export function setCursorBeat(beat: number, opts?: { seek?: boolean }): void {
  const seek = opts?.seek ?? false;
  if (beat === cursorBeat && !seek) return;
  cursorBeat = beat;
  for (const listener of listeners) listener(seek);
}

/**
 * Subscribe to cursor changes. Returns an unsubscribe. The callback receives
 * whether the change was a `seek` (jump) vs a playback advance. Used both by
 * `useSyncExternalStore` (which ignores the arg) and by imperative consumers
 * that drive a handle per frame without rendering (the piano-roll scene + DOM
 * scroll layer).
 */
export function subscribeCursor(onChange: (seek: boolean) => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Reactive raw read — re-renders the caller on every cursor change. */
export function useCursorBeat(): number {
  return useSyncExternalStore(subscribeCursor, getCursorBeat);
}

function depsChanged(a: DependencyList, b: DependencyList): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return true;
  }
  return false;
}

/**
 * Derived cursor read with re-render bailout — a hand-rolled
 * `useSyncExternalStoreWithSelector`. Re-renders the caller ONLY when
 * `selector(beat)` changes per `isEqual` (default `Object.is`); a value/reference
 * that's stable within a region — a `KeySignature` from a memoized list, a
 * constant BPM number, a chord `Annotation` found in a stable array — bails out,
 * so the component never reconciles mid-region even as the cursor advances.
 *
 * `deps` invalidate the cache exactly like `useMemo`'s deps: when the selector
 * closes over new data (a new score, tempoScale, …) the same beat can map to a
 * new value, so the cache must be dropped. Pass everything the selector reads
 * besides `beat`. For selectors that build a FRESH object each call (so `Object.is`
 * can never match), pass an `isEqual` that compares by value.
 */
export function useCursorSelector<T>(
  selector: (beat: number) => T,
  deps: DependencyList,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;

  // Cache keyed on the cursor beat keeps getSnapshot referentially stable while
  // the store hasn't moved; reset when deps change so a new score/tempo can't
  // return a stale value at an unchanged beat.
  const cacheRef = useRef<{ beat: number; value: T } | null>(null);
  const depsRef = useRef<DependencyList | null>(null);
  if (depsRef.current === null || depsChanged(depsRef.current, deps)) {
    depsRef.current = deps;
    cacheRef.current = null;
  }

  const getSnapshot = (): T => {
    const beat = getCursorBeat();
    const prev = cacheRef.current;
    if (prev !== null && prev.beat === beat) return prev.value;
    const next = selectorRef.current(beat);
    if (prev !== null && isEqualRef.current(prev.value, next)) {
      // Value-equal across the beat change: keep the previous reference so
      // useSyncExternalStore bails and the component does not re-render.
      cacheRef.current = { beat, value: prev.value };
      return prev.value;
    }
    cacheRef.current = { beat, value: next };
    return next;
  };

  return useSyncExternalStore(subscribeCursor, getSnapshot);
}
