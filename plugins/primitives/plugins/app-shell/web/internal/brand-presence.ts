import { useEffect, useSyncExternalStore } from "react";

// Which surfaces (tab ids) currently draw the brand: the count of mounted
// `AppShellBrand`s per surface. A surface that draws none — an app with no
// shell chrome (a launcher gallery, a full-bleed site) — is one where global
// chrome must stand in for the brand when nothing else shows a way out.
// Page-global by design: read by chrome mounted outside every surface tree, about whichever surface is focused; keyed by surface id so surfaces never share an entry.
const drawnOn = new Map<string, number>();
const listeners = new Set<() => void>();

function bump(surfaceId: string, delta: 1 | -1): void {
  const next = (drawnOn.get(surfaceId) ?? 0) + delta;
  if (next > 0) drawnOn.set(surfaceId, next);
  else drawnOn.delete(surfaceId);
  for (const l of listeners) l();
}

/** Record that a brand is drawn on `surfaceId` while the caller is mounted. */
export function useRecordBrandDrawn(surfaceId: string | undefined): void {
  useEffect(() => {
    if (surfaceId === undefined) return;
    bump(surfaceId, 1);
    return () => bump(surfaceId, -1);
  }, [surfaceId]);
}

/**
 * Whether the brand is drawn on the surface `surfaceId` (a tab id) — derived
 * from what is mounted, never declared by the app, so it cannot disagree with
 * the screen: an app whose shell places the brand answers `true`, an app with
 * no shell chrome (or a pane with no header) answers `false`.
 */
export function useBrandDrawnOn(surfaceId: string | undefined): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => surfaceId !== undefined && drawnOn.has(surfaceId),
    () => false,
  );
}
