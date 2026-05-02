import { useLayoutEffect, useRef, type ReactNode } from "react";
import { PluginErrorBoundary } from "@core";
import {
  PaneMatchContext,
  type PaneMatch,
  useMatchForPath,
  usePathname,
  useSyncPaneRegistry,
} from "@plugins/primitives/plugins/pane/web";
import { Column } from "./column";

export function MillerColumns() {
  // Must run before useMatchForPath so the matcher sees the current
  // contribution set on first render.
  useSyncPaneRegistry();
  const pathname = usePathname();
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

  const row = (
    <div ref={ref} className="flex h-full overflow-x-auto">
      {match.chain.map((entry, i) => (
        <Column
          key={entry.pane.id}
          entry={entry}
          depth={i}
          isLast={i === match.chain.length - 1}
        />
      ))}
    </div>
  );

  return (
    <PaneMatchContext.Provider value={match}>
      <PluginErrorBoundary slot="layouts.miller" label={pathname}>
        {wrapInProviders(match, row)}
      </PluginErrorBoundary>
    </PaneMatchContext.Provider>
  );
}

/**
 * Compose every chain entry's `provide` component around `row`, outermost
 * first. The result is `<RootProvide><ChildProvide>{row}</ChildProvide></RootProvide>`,
 * so every column has access to every ancestor's provided data via
 * `pane.useData()`.
 *
 * `provide` components own data loading and may suspend the chain by
 * rendering a loading element instead of `<Provider>{children}</Provider>`.
 */
function wrapInProviders(match: PaneMatch, row: ReactNode): ReactNode {
  let body: ReactNode = row;
  for (let i = match.chain.length - 1; i >= 0; i--) {
    const entry = match.chain[i]!;
    const Provide = entry.pane.provide;
    if (Provide) body = <Provide>{body}</Provide>;
  }
  return body;
}
