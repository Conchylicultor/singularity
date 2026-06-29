import {
  createContext,
  createElement,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

/**
 * Insets a display reserves at its lane edges for screen-anchored chrome (e.g.
 * the piano roll's top-right HUD), so edge-clamped transport overlays avoid
 * overlapping it. Default 0.
 */
export interface LaneInsets {
  top: number;
}

const LaneInsetsContext = createContext<LaneInsets>({ top: 0 });

/**
 * Publishes the lane's reserved edge insets to the subtree. Memoized on
 * `insets.top` so consumers reading the context don't churn when an ancestor
 * re-renders with an equal value.
 */
export function LaneInsetsProvider({
  insets,
  children,
}: {
  insets: LaneInsets;
  children: ReactNode;
}) {
  const value = useMemo<LaneInsets>(() => ({ top: insets.top }), [insets.top]);
  return createElement(LaneInsetsContext.Provider, { value }, children);
}

/** Read the lane's reserved edge insets (default `{ top: 0 }` with no provider). */
export function useLaneInsets(): LaneInsets {
  return useContext(LaneInsetsContext);
}
