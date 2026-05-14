import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdSpeed } from "react-icons/md";
import { profilingPane } from "./panes";

export { Profiling } from "./slots";
export { profilingPane } from "./panes";
export type { Span, PhaseConfig, ProfilingContextValue } from "./components/shared";
export {
  GanttSection,
  SpanDetail,
  ProfilingContext,
  useProfilingContext,
  formatDuration,
  groupByPhase,
} from "./components/shared";

export default {
  id: "debug-profiling",
  name: "Profiling",
  description: "Gantt chart of build steps and server startup phases.",
  contributions: [
    Pane.Register({ pane: profilingPane }),
    DebugApp.Sidebar({
      id: "profiling",
      ...sidebarNavItem({ title: "Profiling", icon: MdSpeed, onClick: () => openPane(profilingPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
