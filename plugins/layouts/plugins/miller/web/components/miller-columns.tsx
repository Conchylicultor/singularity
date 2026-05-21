import { Fragment, useContext, useLayoutEffect, useMemo, useRef } from "react";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import {
  PaneBasePathContext,
  PaneInstanceContext,
  PaneMatchContext,
  setBasePath,
  useMatchForChain,
  useSyncPaneRegistry,
} from "@plugins/primitives/plugins/pane/web";
import { Column } from "./column";

export function MillerColumns() {
  const basePath = useContext(PaneBasePathContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- synchronous write before useSyncPaneRegistry
  useMemo(() => { setBasePath(basePath); }, [basePath]);

  // Must run before useMatchForChain so the matcher sees the current
  // contribution set on first render. Must run AFTER setBasePath so that
  // the chain store sees the correct base path on initial load.
  useSyncPaneRegistry();

  const match = useMatchForChain();

  const ref = useRef<HTMLDivElement>(null);
  const lastLength = useRef(0);
  useLayoutEffect(() => {
    const len = match?.chain.length ?? 0;
    if (ref.current && len > lastLength.current) {
      ref.current.scrollLeft = ref.current.scrollWidth;
    }
    lastLength.current = len;
  }, [match?.chain.length]);

  if (!match) return null;

  return (
    <PaneMatchContext.Provider value={match}>
      <PluginErrorBoundary slot="layouts.miller" label={basePath}>
        <div ref={ref} className="flex h-full overflow-x-auto">
          {match.chain.map((entry, i) => (
            <Fragment key={entry.instanceId}>
              <PaneInstanceContext.Provider value={entry.instanceId}>
                <Column
                  entry={entry}
                  isLast={i === match.chain.length - 1}
                />
              </PaneInstanceContext.Provider>
            </Fragment>
          ))}
        </div>
      </PluginErrorBoundary>
    </PaneMatchContext.Provider>
  );
}
