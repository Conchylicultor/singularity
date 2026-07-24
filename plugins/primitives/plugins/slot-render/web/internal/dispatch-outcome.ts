/**
 * The outcome a `defineDispatchSlot` `.Dispatch` publishes to its subtree: did a
 * contribution handle this render, or did the slot's `fallback` (or nothing) run?
 *
 * The value is deliberately THREE PRIMITIVES and nothing more. Carrying the
 * render `props` or the matched `Contribution` object would make the context
 * value change identity on every render of the hottest paths in the app (the
 * conversation transcript dispatches once per event row, per tool card), forcing
 * a re-render of every consumer on churn that says nothing new. Consumers that
 * need the props already have them — they are rendered *by* the dispatch, or
 * receive them from the same parent. What only the slot knows is whether
 * anything matched, and that is exactly what is published.
 */
import { createContext, useContext } from "react";

export interface DispatchOutcome {
  /** Slot id of the nearest enclosing `.Dispatch`. */
  readonly slotId: string;
  /** The dispatch key for that render, i.e. `config.key(props)`. */
  readonly key: string;
  /** True when a contribution matched; false when the slot's `fallback` rendered (or nothing did). */
  readonly matched: boolean;
}

/**
 * Internal — NOT barrel-exported. `.Dispatch` is the single writer; a consumer
 * that could provide this could lie about whether its subtree was handled.
 */
export const DispatchOutcomeContext = createContext<DispatchOutcome | null>(
  null,
);

/**
 * Reads the outcome of the NEAREST enclosing `.Dispatch`, or `null` when
 * rendered outside any dispatch slot.
 */
export function useDispatchOutcome(): DispatchOutcome | null {
  return useContext(DispatchOutcomeContext);
}
