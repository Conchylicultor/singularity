import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { RenderProfilerPane } from "./components/render-profiler-pane";

export const renderProfilerPane = Pane.define({
  id: "render-profiler",
  app: debugApp,
  segment: "render-profiler",
  component: RenderProfilerBody,
});

function RenderProfilerBody() {
  return (
    <PaneChrome pane={renderProfilerPane} title="Render Profiler">
      <RenderProfilerPane />
    </PaneChrome>
  );
}
