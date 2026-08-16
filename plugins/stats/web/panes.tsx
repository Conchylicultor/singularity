import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { StatsPanel } from "./components/stats-panel";

export const statsPane = Pane.define({
  id: "stats",
  app: agentManagerApp,
  segment: "stats",
  component: StatsBody,
});

function StatsBody() {
  return (
    <PaneChrome pane={statsPane} title="Stats">
      <StatsPanel />
    </PaneChrome>
  );
}
