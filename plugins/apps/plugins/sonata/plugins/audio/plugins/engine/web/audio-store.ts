import { useSyncExternalStore } from "react";

/**
 * A module-level reactive store sharing the small slice of audio state that
 * crosses the engine ↔ panel boundary.
 *
 * The Web Audio graph now lives in the headless, always-mounted `AudioEngine`
 * (a `Sonata.Effect`) so collapsing the player's section column never tears the
 * `AudioContext` down. The visible `AudioPanel` (a collapsible `Sonata.Section`)
 * is therefore decoupled from the graph: the slider *writes* `volume` here and
 * the engine reads it to drive master gain; the engine *writes* `status` /
 * `loadError` here and the panel reads them to render. Either component can
 * mount, unmount, or remount independently.
 *
 * Mirrors the `transport-store` module-bus pattern, with a `useSyncExternalStore`
 * subscription so React consumers re-render on change (no Context that both the
 * Effect host and the Section host would have to share).
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

/** Panel → engine: set the master volume. */
export function setAudioVolume(volume: number): void {
  patch({ volume });
}

/** Engine → panel: publish the aggregate load status. */
export function setAudioStatus(status: AudioStatus): void {
  patch({ status });
}

/** Engine → panel: publish (or clear) the latest load error. */
export function setAudioLoadError(loadError: string | null): void {
  patch({ loadError });
}
