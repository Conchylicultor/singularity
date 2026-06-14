import type { ReactNode } from "react";
import { AudioStoreProvider } from "../audio-store";

/**
 * Per-surface audio-store provider, folded above a Sonata surface's whole
 * subtree via the `Sonata.SurfaceProvider` wrapper slot — so the `AudioEngine`
 * effect and the `VolumeControl` toolbar widget (siblings in different slot
 * branches) share ONE per-surface audio store.
 */
export function AudioProvider({ children }: { children: ReactNode }) {
  return <AudioStoreProvider>{children}</AudioStoreProvider>;
}
