import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { studioApp } from "@plugins/apps/plugins/studio/plugins/shell/core";
import { ExplorerView } from "./components/explorer-view";

export const explorerPane = Pane.define({
  route: defineRoute({ id: "explorer", segment: "explorer" }),
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
