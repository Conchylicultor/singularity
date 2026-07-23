import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { ConfigOrphansPanel } from "./components/config-orphans-panel";

export const configOrphansPane = Pane.define({
  id: "config-orphans",
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
