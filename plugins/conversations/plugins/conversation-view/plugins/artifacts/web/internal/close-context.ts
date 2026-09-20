import { createContext, useContext } from "react";

/**
 * How a kind's section dismisses the surface it is being shown in.
 *
 * `null` means there is nothing to dismiss — the sections are rendered
 * somewhere that isn't a transient surface. That is a real state, not a missing
 * host, so {@link useCloseArtifacts} answers with a no-op rather than throwing.
 */
export const ArtifactsCloseContext = createContext<(() => void) | null>(null);

const NOTHING_TO_CLOSE = (): void => {};

/**
 * Dismiss the popover the artifact sections are in.
 *
 * `ArtifactRow` already calls this for you when its row is activated, so a kind
 * that lists rows never has to think about it. Reach for it directly only in a
 * bespoke layout (a thumbnail grid, a chip strip) that opens something itself.
 */
export function useCloseArtifacts(): () => void {
  return useContext(ArtifactsCloseContext) ?? NOTHING_TO_CLOSE;
}
