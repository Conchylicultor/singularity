import { useSyncExternalStore } from "react";

/**
 * A module-level reactive store sharing the small slice of audio state that
 * crosses the engine ↔ control boundary.
 *
 * The Web Audio graph lives in the headless, always-mounted `AudioEngine`
 * (a `Sonata.Effect`) so no piece of mountable UI can tear the `AudioContext`
 * down. The `VolumeControl` (a `Sonata.Toolbar` widget) is therefore decoupled
 * from the graph: the slider *writes* `volume` here and the engine reads it to
 * drive master gain; the engine *writes* `status` / `loadError` here. Either
 * component can mount, unmount, or remount independently.
 *
 * Mirrors the `transport-store` module-bus pattern, with a `useSyncExternalStore`
 * subscription so React consumers re-render on change (no Context that both the
 * Effect host and the Toolbar host would have to share).
 */

export type AudioStatus = "empty" | "loading" | "ready";

export interface AudioState {
  /** Master volume 0..1, driven by the panel slider. */
  volume: number;
  /** Aggregate sample-load status of the in-use instruments. */
  status: AudioStatus;
  /** Latest instrument load failure message, or null. */
  loadError: string | null;
}

export const DEFAULT_VOLUME = 0.8;

let state: AudioState = {
  volume: DEFAULT_VOLUME,
  status: "empty",
  loadError: null,
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

// Replace state only on a real change so `getSnapshot`'s identity is stable
// (a fresh object every read would loop `useSyncExternalStore`).
function patch(next: Partial<AudioState>): void {
  const merged = { ...state, ...next };
  if (
    merged.volume === state.volume &&
    merged.status === state.status &&
    merged.loadError === state.loadError
  ) {
    return;
  }
  state = merged;
  emit();
}

/** Reactive read of the full audio state. */
export function useAudioState(): AudioState {
  return useSyncExternalStore(subscribe, () => state);
}

// The level to restore on un-mute: the most recent non-zero volume. Module-level
// (not in `state`) so a click-to-mute survives the control unmounting/remounting
// — no UI reads it, only `toggleAudioMute` does.
let lastNonZeroVolume = DEFAULT_VOLUME;

/** Control → engine: set the master volume. */
export function setAudioVolume(volume: number): void {
  if (volume > 0) lastNonZeroVolume = volume;
  patch({ volume });
}

/** Mute (volume → 0) or restore the pre-mute level. Dragging to 0 then toggling
 *  restores the last audible level; toggling an already-0 level un-mutes. */
export function toggleAudioMute(): void {
  setAudioVolume(state.volume > 0 ? 0 : lastNonZeroVolume);
}

/** Engine → panel: publish the aggregate load status. */
export function setAudioStatus(status: AudioStatus): void {
  patch({ status });
}

/** Engine → panel: publish (or clear) the latest load error. */
export function setAudioLoadError(loadError: string | null): void {
  patch({ loadError });
}
