import { FullPane } from "@plugins/layouts/plugins/full-pane/web";
import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import {
  type AnyPane,
  usePaneMatch,
} from "@plugins/primitives/plugins/pane/web";

/**
 * Mixing host for apps that use **both** layouts. It reads the surface's
 * already-resolved route match and dispatches the active pane to the right
 * renderer: panes named in `full` render full-surface via {@link FullPane};
 * everything else renders as Miller columns via {@link MillerColumns}.
 *
 * `full` lists the app's **own** pane objects (not a cross-plugin contributor),
 * so layout ownership lives in the layout layer while panes stay pure. The
 * match itself is resolved once per surface by `PaneSurfaceProvider`, so all
 * three of these components are pure consumers — nothing here syncs the route.
 */
export function PaneLayoutHost({
  full,
}: {
  full: AnyPane[];
}) {
  const match = usePaneMatch();
  // Active pane = last entry.
  const active = match?.panes?.at(-1);
  const isFull = !!active && full.some((p) => p.id === active.pane.id);
  return isFull ? <FullPane /> : <MillerColumns />;
}
