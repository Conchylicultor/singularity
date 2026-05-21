import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { GanttView } from "./components/gantt-view";

export const profilingPane = Pane.define({
  id: "debug-profiling",
  segment: "profiling",
  component: ProfilingBody,
});

function ProfilingBody() {
  return (
    <PaneChrome pane={profilingPane} title="Profiling">
      <GanttView />
    </PaneChrome>
  );
}
