import { useMemo, type DependencyList } from "react";
import {
  defineScopedStore,
  type ScopedStore,
} from "@plugins/primitives/plugins/scoped-store/web";

/**
 * The playback cursor (playhead position in quarter-note beats) as a
 * PER-SURFACE scoped store rather than a module singleton.
 *
 * The transport advances the cursor ~60×/sec from a `requestAnimationFrame`
 * loop. Holding it in `SonataContextValue` would mint a new context object every
 * frame and re-render EVERY `useSonata()` consumer — including ones that only
 * forward the cursor to an imperative handle (the Pixi piano-roll scene, the
 * audio scheduler) or whose output changes only at region boundaries (the
 * key/chord HUD). Keeping it in an external store lets each consumer opt into
 * exactly the read path it needs and leaves the context value identity-stable
 * during playback (so non-readers stop re-rendering entirely).
 *
 * Scoping it to the `<CursorStoreProvider>` (mounted in `SonataLayout`, wrapping
 * `SonataProvider`) gives every Sonata surface its own isolated cursor — desktop
 * multi-window / keep-alive tabs mount several surfaces at once, and a module
 * singleton would tear (playback bleeding between windows).
 *
 * Three read paths, mirroring the scoped-store primitive this builds on:
 *  - {@link useCursorApi} — imperative facade for in-subtree readers (rAF loops,
 *    synchronous reads). Drives a scene handle or DOM transform with ZERO React
 *    renders.
 *  - {@link useCursorBeat} — raw reactive; re-renders the caller every frame
 *    (for consumers whose output genuinely changes per frame).
 *  - {@link useCursorSelector} — derived-with-bailout; re-renders only when the
 *    selected value changes (for frame-invariant HUD/readout consumers).
 */

interface CursorState {
  beat: number;
}
const cursorStore = defineScopedStore<CursorState>({ beat: 0 });

export const CursorStoreProvider = cursorStore.Provider;
export type CursorStore = ScopedStore<CursorState>;

/**
 * Typed imperative facade over the per-surface cursor store. Carries the `seek`
 * flag through scoped-store's `meta`.
 *
 * `seek: true` marks a jump (seek / scrub / score reset) as opposed to a smooth
 * playback advance. Imperative onset-driven consumers (the piano-roll scene)
 * re-anchor on a seek instead of firing every onset between the old and new
 * position — navigation must not spray note-strike FX. It's threaded through the
 * subscription callback rather than inferred, because the synchronous store
 * write reaches imperative subscribers BEFORE React commits any `seekEpoch`.
 *
 * `setBeat` early-returns on an unchanged beat (unless it's a seek) so the
 * snapshot stays referentially stable while the store hasn't moved — required
 * for the `useSyncExternalStore` tearing check not to loop.
 */
export interface CursorApi {
  getBeat(): number;
  setBeat(beat: number, opts?: { seek?: boolean }): void;
  subscribe(cb: (seek: boolean) => void): () => void;
}

/** Build the imperative cursor facade for a given scoped store instance. */
export function cursorApiFor(store: CursorStore): CursorApi {
  return {
    getBeat: () => store.getState().beat,
    setBeat: (beat, opts) =>
      store.setState((p) => (p.beat === beat && !opts?.seek ? p : { beat }), {
        meta: { seek: !!opts?.seek },
      }),
    subscribe: (cb) =>
      store.subscribe((meta) =>
        cb(Boolean((meta as { seek?: boolean } | undefined)?.seek)),
      ),
  };
}

/** Imperative cursor facade for in-subtree readers (rAF loops, synchronous reads). */
export function useCursorApi(): CursorApi {
  const store = cursorStore.useStoreApi();
  return useMemo(() => cursorApiFor(store), [store]);
}

/** Reactive raw read — re-renders the caller on every cursor change. */
export function useCursorBeat(): number {
  return cursorStore.useSelector((s) => s.beat, []);
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
  isEqual?: (a: T, b: T) => boolean,
): T {
  return cursorStore.useSelector((s) => selector(s.beat), deps, isEqual);
}
