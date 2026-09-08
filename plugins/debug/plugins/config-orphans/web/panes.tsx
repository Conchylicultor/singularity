import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { ConfigOrphansPanel } from "./components/config-orphans-panel";

export const configOrphansPane = Pane.define({
  route: defineRoute({
    id: "config-orphans",
    segment: "config-orphans",
  }),
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
