import { createContext, useRef, type ReactNode, type RefObject } from "react";

/**
 * The box a {@link SurfaceOverlay} fills. Carries the HOST's ref OBJECT — not
 * the element — so the context value is stable for the host's whole life and
 * mounting a host never re-renders its subtree. (The element itself is only
 * read in a layout effect, by which time the ref is populated.)
 *
 * `null` means "nobody declared a surface above me", which is a bug at the
 * overlay, not a mode to degrade into — see the throw in `<SurfaceOverlay>`.
 */
export const SurfaceOverlayHostContext =
  createContext<RefObject<HTMLDivElement | null> | null>(null);

/**
 * Declares "overlays may fill this box" — one per surface, mounted by whoever
 * owns the surface's outer box (`apps-core/tab-surface`, once per app tab).
 *
 * It is a `relative` box, so the overlay's `absolute inset-0` resolves against
 * THIS element: the region below the tab bar and right of the app rail, under
 * every placement (docked / floating window / solo) because each of them hands
 * the tab a different outer box and this host is inside all of them.
 */
export function SurfaceOverlayHost({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <SurfaceOverlayHostContext value={ref}>
      <div ref={ref} className="relative size-full">
        {children}
      </div>
    </SurfaceOverlayHostContext>
  );
}
