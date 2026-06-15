import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import { Pane, PaneChrome, type } from "@plugins/primitives/plugins/pane/web";
import { GraphView } from "./components/graph-view";

export const graphCanvasPane = Pane.define({
  id: "graph",
  segment: "graph",
  component: GraphBody,
  chrome: false,
  width: 900,
  input: type<{ focusId?: PluginId }>(),
});

function GraphBody() {
  const { focusId } = graphCanvasPane.useInput();
  return (
    <PaneChrome pane={graphCanvasPane} title="Plugin Graph">
      <div className="h-full overflow-hidden">
        <GraphView paneFocusId={focusId} />
      </div>
    </PaneChrome>
  );
}
