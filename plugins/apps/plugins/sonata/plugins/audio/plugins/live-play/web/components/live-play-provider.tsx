import type { ReactNode } from "react";
import { LivePlayStoreProvider } from "../live-store";

/**
 * Per-surface live-play-store provider, folded above a Sonata surface's whole
 * subtree via the `Sonata.SurfaceProvider` wrapper slot — so the `LivePlayEngine`
 * effect and the playable keyboard (siblings in different slot branches) share
 * ONE per-surface live-play store.
 */
export function LivePlayProvider({ children }: { children: ReactNode }) {
  return <LivePlayStoreProvider>{children}</LivePlayStoreProvider>;
}
