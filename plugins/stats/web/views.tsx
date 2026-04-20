import type { PaneDescriptor } from "@plugins/shell/web";
import { StatsPanel } from "./components/stats-panel";

export function statsPane(): PaneDescriptor {
  return { title: "Stats", component: StatsPanel, path: "/stats" };
}
