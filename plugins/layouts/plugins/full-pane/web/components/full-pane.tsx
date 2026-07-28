import { DeferredRouteFallback } from "@plugins/layouts/plugins/route-fallback/web";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { PortalForwardProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  PaneInstanceContext,
  PaneLayoutContext,
  PaneResolveGuard,
  usePaneMatch,
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
 * Pure consumer of the surface's route match: `PaneSurfaceProvider` resolves it
 * once for the whole surface (`PaneMatchContext`), so this renderer neither
 * syncs the registry nor provides the context — it only paints.
 */
export function FullPane() {
  const match = usePaneMatch();
  // Active pane = last entry.
  const active = match?.panes?.at(-1);
  // No active pane. On a cold deep-link the target pane's plugin may still be
  // loading in the deferred tier, so show a loading placeholder while that is in
  // progress; once deferred loading settles this falls back to null (a real
  // no-match). See route-fallback for the full rationale.
  if (!active) return <DeferredRouteFallback />;
  return (
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
}
