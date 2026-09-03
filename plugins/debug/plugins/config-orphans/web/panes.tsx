import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { ConfigOrphansPanel } from "./components/config-orphans-panel";

const configOrphansRoute = defineRoute({
  id: "config-orphans",
  segment: "config-orphans",
});

export const configOrphansPane = Pane.define({
  route: configOrphansRoute,
  app: debugApp,
  component: ConfigOrphansBody,
});

function ConfigOrphansBody() {
  return (
    <PaneChrome pane={configOrphansPane} title="Config Orphans">
      <ConfigOrphansPanel />
    </PaneChrome>
  );
}
