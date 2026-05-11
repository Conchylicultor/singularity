import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Debug } from "@plugins/debug/web";
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
    Debug.Item({
      id: "profiling",
      title: "Profiling",
      icon: MdSpeed,
      onClick: () => profilingPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
