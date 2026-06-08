import { useContext } from "react";
import { FullPane } from "@plugins/layouts/plugins/full-pane/web";
import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import {
  type PaneObject,
  PaneBasePathContext,
  PaneMatchContext,
  usePaneRoute,
} from "@plugins/primitives/plugins/pane/web";

/**
 * Mixing host for apps that use **both** layouts. It resolves the route once,
 * provides `PaneMatchContext`, and dispatches the active pane to the right
 * renderer: panes named in `full` render full-surface via {@link FullPane};
 * everything else renders as Miller columns via {@link MillerColumns}.
 *
 * `full` lists the app's **own** pane objects (not a cross-plugin contributor),
 * so layout ownership lives in the layout layer while panes stay pure. Because
 * the host already resolves the route and provides the match + context, both
 * inner renderers receive the `match` prop and skip their own self-resolve —
 * the route is synced exactly once.
 */
export function PaneLayoutHost({
  full,
}: {
  full: PaneObject<any, any, any>[];
}) {
  const basePath = useContext(PaneBasePathContext);
  const match = usePaneRoute(basePath);
  // Active pane = last entry. Index access (not Array.at) — the web-core
  // tsconfig lib predates ES2022.
  const chain = match?.chain;
  const active = chain && chain.length > 0 ? chain[chain.length - 1] : undefined;
  const isFull = !!active && full.some((p) => p.id === active.pane.id);
  return (
    <PaneMatchContext.Provider value={match}>
      {isFull ? (
        <FullPane match={match ?? undefined} />
      ) : (
        <MillerColumns match={match ?? undefined} />
      )}
    </PaneMatchContext.Provider>
  );
}
