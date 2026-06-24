import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import { Pane, PaneChrome, type } from "@plugins/primitives/plugins/pane/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { GraphView } from "./components/graph-view";

export const graphCanvasPane = Pane.define({
  id: "graph",
  segment: "graph",
  component: GraphBody,
  width: 900,
  input: type<{ focusId?: PluginId }>(),
});

function GraphBody() {
  const { focusId } = graphCanvasPane.useInput();
  return (
    <PaneChrome pane={graphCanvasPane} title="Plugin Graph">
      <Clip className="h-full">
        <GraphView paneFocusId={focusId} />
      </Clip>
    </PaneChrome>
  );
}
