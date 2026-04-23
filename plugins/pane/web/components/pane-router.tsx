import { PluginErrorBoundary } from "@core";
import { PaneMatchContext, useMatchForPath, usePathname } from "../pane";
import { PaneLevel } from "./outlet";

/**
 * Top-level pane router. Reads the current URL and renders the longest
 * matching pane chain, root → leaf. Returns `null` when no pane matches.
 */
export function PaneRouter() {
  const pathname = usePathname();
  const match = useMatchForPath(pathname);
  if (!match) return null;
  return (
    <PaneMatchContext.Provider value={match}>
      <PluginErrorBoundary slot="pane.router" label={pathname}>
        <PaneLevel match={match} depth={0} />
      </PluginErrorBoundary>
    </PaneMatchContext.Provider>
  );
}
