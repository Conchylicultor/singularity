import { useSurfaceMode } from "@plugins/apps-core/plugins/tabs/web";

/**
 * Whether the bar is pinned (docked in the tab bar) — derived from the surface
 * mode, never stored. Desktop and tab modes paint the tab bar, so the bar docks
 * there; fullscreen (solo) covers the tab bar and app rail, so the bar floats
 * over the app instead. Both hosts read this one answer, so exactly one of
 * them renders at a time.
 */
export function useActionBarPinned(): boolean {
  return useSurfaceMode() !== "solo";
}
