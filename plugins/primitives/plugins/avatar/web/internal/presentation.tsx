import { createContext, useContext, type ReactNode } from "react";

/**
 * How an `<Avatar>` draws itself in a region:
 * - `badge` (default): the density-ramp size (`useControlSize`) and the soft
 *   tint — the avatar in rows, chips and headers.
 * - `tile`: the box fills its parent (the host sizes the tile), a flat fill
 *   under the categorical-foreground glyph at 46% of the box — a launcher tile.
 *
 * A region property like `ControlSize`, never a per-instance prop: the view that
 * lays out tiles declares it once, and every avatar a field renders inside
 * follows without the field knowing where it is drawn.
 */
export type AvatarPresentation = "badge" | "tile";

const AvatarPresentationContext = createContext<AvatarPresentation>("badge");

/** Declares the avatar presentation for everything inside (innermost wins). */
export function AvatarPresentationProvider({
  value,
  children,
}: {
  value: AvatarPresentation;
  children: ReactNode;
}) {
  return (
    <AvatarPresentationContext.Provider value={value}>
      {children}
    </AvatarPresentationContext.Provider>
  );
}

/** Reads the ambient avatar presentation. Defaults to `"badge"` outside any provider. */
export function useAvatarPresentation(): AvatarPresentation {
  return useContext(AvatarPresentationContext);
}
