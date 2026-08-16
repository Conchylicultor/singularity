import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { ConfigOrphansPanel } from "./components/config-orphans-panel";

export const configOrphansPane = Pane.define({
  id: "config-orphans",
  app: debugApp,
  segment: "config-orphans",
  component: ConfigOrphansBody,
});

function ConfigOrphansBody() {
  return (
    <PaneChrome pane={configOrphansPane} title="Config Orphans">
      <ConfigOrphansPanel />
    </PaneChrome>
  );
}
