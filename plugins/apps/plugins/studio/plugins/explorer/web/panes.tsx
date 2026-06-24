import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { ExplorerView } from "./components/explorer-view";

export const explorerPane = Pane.define({
  id: "explorer",
  segment: "explorer",
  component: ExplorerBody,
  width: 360,
});

function ExplorerBody() {
  return (
    <PaneChrome pane={explorerPane} title="Explorer">
      <ExplorerView />
    </PaneChrome>
  );
}
