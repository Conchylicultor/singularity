import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { StatsPanel } from "./components/stats-panel";

const statsRoute = defineRoute({
  id: "stats",
  segment: "stats",
});

export const statsPane = Pane.define({
  route: statsRoute,
  app: agentManagerApp,
  component: StatsBody,
});

function StatsBody() {
  return (
    <PaneChrome pane={statsPane} title="Stats">
      <StatsPanel />
    </PaneChrome>
  );
}
