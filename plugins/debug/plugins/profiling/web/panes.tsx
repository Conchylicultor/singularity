import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { GanttView } from "./components/gantt-view";

const profilingRoute = defineRoute({
  id: "debug-profiling",
  segment: "profiling",
});

export const profilingPane = Pane.define({
  route: profilingRoute,
  app: debugApp,
  component: ProfilingBody,
});

function ProfilingBody() {
  return (
    <PaneChrome pane={profilingPane} title="Profiling">
      <GanttView />
    </PaneChrome>
  );
}
