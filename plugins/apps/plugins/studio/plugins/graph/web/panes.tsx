import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { GraphView } from "./components/graph-view";

export const graphCanvasPane = Pane.define({
  id: "graph",
  segment: "graph",
  component: GraphBody,
  width: 900,
  // Which plugin to center the closure subgraph on. A pane OPTION: it mirrors no
  // server state, and "no focus" (the whole graph) is a legitimate default, not
  // a missing value.
  options: { focusId: undefined as PluginId | undefined },
});

function GraphBody() {
  const { focusId } = graphCanvasPane.useOptions();
  return (
    <PaneChrome pane={graphCanvasPane} title="Plugin Graph">
      <Clip className="h-full">
        <GraphView paneFocusId={focusId} />
      </Clip>
    </PaneChrome>
  );
}
