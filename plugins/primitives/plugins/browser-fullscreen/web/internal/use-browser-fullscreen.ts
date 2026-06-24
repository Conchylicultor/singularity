import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

function getSnapshot(): boolean {
  return document.fullscreenElement !== null;
}

/** Reactive native browser-fullscreen state, kept in sync via the `fullscreenchange` event. */
export function useBrowserFullscreen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
