import { useContext } from "react";
import {
  PaneDepthContext,
  PaneMatchContext,
  type PaneMatch,
} from "../pane";

export function Outlet() {
  const match = useContext(PaneMatchContext);
  const depth = useContext(PaneDepthContext);
  if (!match) return null;
  return <PaneLevel match={match} depth={depth + 1} />;
}

export function PaneLevel({
  match,
  depth,
}: {
  match: PaneMatch;
  depth: number;
}) {
  const entry = match.chain[depth];
  if (!entry) return null;
  const Component = entry.pane.component;
  return (
    <PaneDepthContext.Provider value={depth}>
      <Component />
    </PaneDepthContext.Provider>
  );
}
