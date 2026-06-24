import { useContext } from "react";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { PortalForwardProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  type PaneMatch,
  PaneBasePathContext,
  PaneInstanceContext,
  PaneLayoutContext,
  PaneMatchContext,
  PaneResolveGuard,
  usePaneRoute,
} from "@plugins/primitives/plugins/pane/web";

// A full-pane surface is the only column, so it IS both the surface start and
// end edge — a full-surface pane's header hosts the sidebar toggle and reserves
// the floating-action-bar safe area. There is no maximize/drag in full-pane.
// Module-level constant so the context value keeps a stable identity.
const FULL_PANE_LAYOUT_CTX = {
  onDoubleClickHeader: () => {},
  atSurfaceStart: true,
  atSurfaceEnd: true,
} as const;

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
  // Active pane = last entry.
  const active = match?.panes?.at(-1);
  if (!active) return null;
  const body = (
    <PaneInstanceContext.Provider value={active.instanceId}>
      <PaneLayoutContext.Provider value={FULL_PANE_LAYOUT_CTX}>
        <PluginErrorBoundary slot="layouts.full-pane" label={active.pane.id}>
          <div className="h-full min-h-0" data-pane-id={active.pane.id}>
            {/* Forward the pane id across portals so popovers/menus opened from
                this pane still report their containing pane to the picker. */}
            <PortalForwardProvider name="data-pane-id" value={active.pane.id}>
              <PaneResolveGuard pane={active.pane} params={active.params} />
            </PortalForwardProvider>
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
