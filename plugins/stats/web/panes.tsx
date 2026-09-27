import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { StatsPanel } from "./components/stats-panel";

export const statsPane = Pane.define({
  title: "Stats",
  route: defineRoute({
    id: "stats",
    segment: "stats",
  }),
  app: agentManagerApp,
  component: StatsBody,
});

function StatsBody() {
  return (
    <PaneChrome pane={statsPane}>
      <StatsPanel />
    </PaneChrome>
  );
}
