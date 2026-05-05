import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { StatsPanel } from "./components/stats-panel";

export const statsPane = Pane.define({
  id: "stats",
  after: [null],
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
