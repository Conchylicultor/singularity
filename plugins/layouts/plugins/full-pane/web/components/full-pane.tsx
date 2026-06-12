import { useContext } from "react";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import {
  type PaneMatch,
  PaneBasePathContext,
  PaneInstanceContext,
  PaneLayoutContext,
  PaneMatchContext,
  PaneResolveGuard,
  usePaneRoute,
} from "@plugins/primitives/plugins/pane/web";

/**
 * Full-surface layout renderer: paints only the **active pane**
 * (`match.panes.at(-1)`) filling the whole surface — no columns, no
 * ancestors. The screen-stack navigation model: each `mode:"root"` open
 * replaces the route with a single pane, so the active pane *is* the screen.
 *
 * Works both standalone (self-resolves the route via {@link usePaneRoute} and
 * provides {@link PaneMatchContext}) and under `<PaneLayoutHost/>` (consumes the
 * host's already-resolved `match` + context — no double sync). `usePaneRoute`
 * is called unconditionally every render to keep hook order stable even when a
 * `match` prop is provided.
 */
export function FullPane({ match: provided }: { match?: PaneMatch }) {
  const basePath = useContext(PaneBasePathContext);
  const selfMatch = usePaneRoute(basePath);
  const match = provided ?? selfMatch;
  // Active pane = last entry. Index access (not Array.at) — the web-core
  // tsconfig lib predates ES2022.
  const panes = match?.panes;
  const active = panes && panes.length > 0 ? panes[panes.length - 1] : undefined;
  if (!active) return null;
  const body = (
    <PaneInstanceContext.Provider value={active.instanceId}>
      {/* No maximize/drag in full-pane — the layout context stays empty. */}
      <PaneLayoutContext.Provider value={null}>
        <PluginErrorBoundary slot="layouts.full-pane" label={active.pane.id}>
          <div className="h-full min-h-0" data-pane-id={active.pane.id}>
            <PaneResolveGuard pane={active.pane} params={active.params} />
          </div>
        </PluginErrorBoundary>
      </PaneLayoutContext.Provider>
    </PaneInstanceContext.Provider>
  );
  return provided ? (
    body
  ) : (
    <PaneMatchContext.Provider value={match}>{body}</PaneMatchContext.Provider>
  );
}
