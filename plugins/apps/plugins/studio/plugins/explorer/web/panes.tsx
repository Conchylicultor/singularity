import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { studioApp } from "@plugins/apps/plugins/studio/plugins/shell/core";
import { ExplorerView } from "./components/explorer-view";

const explorerRoute = defineRoute({
  id: "explorer",
  segment: "explorer",
});

export const explorerPane = Pane.define({
  route: explorerRoute,
  app: studioApp,
  component: ExplorerBody,
  width: 360,
});

function ExplorerBody() {
  return (
    <PaneChrome pane={explorerPane} title="Plugin">
      <ExplorerView />
    </PaneChrome>
  );
}
