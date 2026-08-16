import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { GanttView } from "./components/gantt-view";

export const profilingPane = Pane.define({
  id: "debug-profiling",
  app: debugApp,
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
