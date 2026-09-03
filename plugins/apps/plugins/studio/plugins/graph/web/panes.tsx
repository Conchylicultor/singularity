import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { studioApp } from "@plugins/apps/plugins/studio/plugins/shell/core";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { GraphView } from "./components/graph-view";

const graphCanvasRoute = defineRoute({
  id: "graph",
  segment: "graph",
});

export const graphCanvasPane = Pane.define({
  route: graphCanvasRoute,
  app: studioApp,
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
