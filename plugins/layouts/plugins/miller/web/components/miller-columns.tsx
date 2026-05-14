import { Fragment, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import {
  PaneBasePathContext,
  PaneInstanceContext,
  PaneMatchContext,
  setBasePath,
  stripBasePath,
  useMatchForPath,
  usePathname,
  useSyncPaneRegistry,
} from "@plugins/primitives/plugins/pane/web";
import { Column } from "./column";

export function MillerColumns() {
  const basePath = useContext(PaneBasePathContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- synchronous write before useSyncPaneRegistry
  useMemo(() => { setBasePath(basePath); }, [basePath]);

  // Must run before useMatchForPath so the matcher sees the current
  // contribution set on first render. Must run AFTER setBasePath so that
  // handleLocationChange() strips the base path correctly on initial load.
  useSyncPaneRegistry();

  const rawPathname = usePathname();
  const pathname = stripBasePath(rawPathname, basePath);
  const match = useMatchForPath(pathname);

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
      <PluginErrorBoundary slot="layouts.miller" label={pathname}>
        <div ref={ref} className="flex h-full overflow-x-auto">
          {match.chain.map((entry, i) => {
            let column: ReactNode = (
              <Column
                entry={entry}
                isLast={i === match.chain.length - 1}
              />
            );
            // Wrap with providers from chain[0..i], innermost (i) wraps closest.
            // Always wrap at j === i to set PaneInstanceContext for the column itself.
            for (let j = i; j >= 0; j--) {
              const chainEntry = match.chain[j]!;
              const Provide = chainEntry.pane.provide;
              if (Provide || j === i) {
                column = (
                  <PaneInstanceContext.Provider value={chainEntry.instanceId}>
                    {Provide ? <Provide>{column}</Provide> : column}
                  </PaneInstanceContext.Provider>
                );
              }
            }
            return <Fragment key={entry.instanceId}>{column}</Fragment>;
          })}
        </div>
      </PluginErrorBoundary>
    </PaneMatchContext.Provider>
  );
}
