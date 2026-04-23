import { Pane } from "@plugins/pane/web";
import { StatsPanel } from "./components/stats-panel";

export const statsPane = Pane.define({
  id: "stats",
  path: "/stats",
  component: StatsPanel,
});
