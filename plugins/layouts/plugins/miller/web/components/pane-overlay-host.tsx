import { useContext, useMemo } from "react";
import {
  PaneBasePathContext,
  setBasePath,
  useRoute,
  useSyncPaneRegistry,
} from "@plugins/primitives/plugins/pane/web";
import { MillerColumns } from "./miller-columns";

/**
 * Hosts the active pane chain as an overlay above an app's own custom layout.
 *
 * Apps whose main area *is* the pane renderer mount {@link MillerColumns}
 * directly (via AppShellLayout). Apps with a bespoke full-viewport layout
 * (e.g. Sonata) mount this instead, so global actions that open panes — the
 * theme customizer, etc. — work there too.
 *
 * It always syncs the pane registry (even with no pane open) so that
 * `openPane` from a global action never throws "Unknown pane". When a pane is
 * present it renders MillerColumns in an opaque, absolutely-positioned overlay;
 * otherwise it renders nothing and the host app stays fully interactive. The
 * overlay sits below the floating action bar (`z-popover`), so the action that
 * opened the pane remains reachable to toggle it closed. The host's container
 * must be positioned (`relative`).
 */
export function PaneOverlayHost() {
  const basePath = useContext(PaneBasePathContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- synchronous write before useSyncPaneRegistry
  useMemo(() => {
    setBasePath(basePath);
  }, [basePath]);
  useSyncPaneRegistry();

  const match = useRoute();
  const hasPane = !!match && match.panes.length > 0;
  if (!hasPane) return null;

  return (
    // An absolute inset-0 overlay box filling the host app's `relative`
    // container (NOT an in-flow Overlay layer, and NOT viewport-portalled).
    // No primitive covers "be the absolute inset-0 positioned box itself".
    // eslint-disable-next-line layout/no-adhoc-layout -- absolute inset-0 overlay box filling the host's relative container
    <div className="absolute inset-0 z-overlay bg-background">
      <MillerColumns />
    </div>
  );
}
