import { useMemo, type ReactNode } from "react";
import type {
  ItemActionProps,
  ItemActionsDescriptor,
  ItemActionZone,
} from "../../core";

/** No-op zones hook so `useItemActionZones` always calls a hook unconditionally
 *  (rules-of-hooks), whether or not the consumer supplied `itemActions` — the
 *  same shape as `data-table`'s `noRowDecoration`. Frozen module constant so it
 *  never churns the memo below. */
const NO_ZONES: Record<ItemActionZone, boolean> = {
  persistent: false,
  revealed: false,
};
const useNoZones = (): Record<ItemActionZone, boolean> => NO_ZONES;

/**
 * The ONE rule mapping an action's declared {@link ItemActionZone} onto a view.
 * It lives here, not in each view child, so the four views cannot drift — a view
 * only says WHERE each arm goes.
 *
 * - `itemActions` absent ⇒ both arms `null` (nothing to render).
 * - **`hasPersistentSlot: false`** ⇒ `persistent` is `null` and `revealed`
 *   renders the descriptor's `Row` **unfiltered** (every zone). A persistent
 *   action is demoted to hover, **never dropped** — a view with no permanent
 *   region is still the only place that action can appear.
 * - **`hasPersistentSlot: true`** ⇒ each arm is non-null only when a
 *   contribution actually claims that zone, so a view never paints an empty
 *   `RowActions` box.
 *
 * `hasPersistentSlot` is **required**: a new view type has to answer it, which
 * is what stops the question from being silently forgotten.
 *
 * It is a hook (it reads the live contribution set), so call it ONCE per view
 * render — before any early return — and apply the returned render functions per
 * row. The arms are memoized, so a view may safely put them in a `useCallback`
 * dependency list.
 */
export function useItemActionZones<TRow>(
  itemActions: ItemActionsDescriptor<TRow> | undefined,
  opts: { hasPersistentSlot: boolean },
): {
  persistent: ((p: ItemActionProps<TRow>) => ReactNode) | null;
  revealed: ((p: ItemActionProps<TRow>) => ReactNode) | null;
} {
  const { hasPersistentSlot } = opts;
  const useZones = itemActions?.useZones ?? useNoZones;
  const zones = useZones();
  const hasPersistent = zones.persistent;
  const hasRevealed = zones.revealed;

  return useMemo(() => {
    if (!itemActions) return { persistent: null, revealed: null };
    const Row = itemActions.Row;
    if (!hasPersistentSlot) {
      // No permanent region: ONE unfiltered cluster carries every zone.
      return {
        persistent: null,
        revealed: (p: ItemActionProps<TRow>) => <Row {...p} />,
      };
    }
    return {
      persistent: hasPersistent
        ? (p: ItemActionProps<TRow>) => <Row {...p} zone="persistent" />
        : null,
      revealed: hasRevealed
        ? (p: ItemActionProps<TRow>) => <Row {...p} zone="revealed" />
        : null,
    };
  }, [itemActions, hasPersistentSlot, hasPersistent, hasRevealed]);
}
