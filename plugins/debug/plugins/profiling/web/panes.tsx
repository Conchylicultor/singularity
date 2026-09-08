import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { GanttView } from "./components/gantt-view";

export const profilingPane = Pane.define({
  route: defineRoute({
    id: "debug-profiling",
    segment: "profiling",
  }),
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
