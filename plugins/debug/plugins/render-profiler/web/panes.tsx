import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { RenderProfilerPane } from "./components/render-profiler-pane";

const renderProfilerRoute = defineRoute({
  id: "render-profiler",
  segment: "render-profiler",
});

export const renderProfilerPane = Pane.define({
  route: renderProfilerRoute,
  app: debugApp,
  component: RenderProfilerBody,
});

function RenderProfilerBody() {
  return (
    <PaneChrome pane={renderProfilerPane} title="Render Profiler">
      <RenderProfilerPane />
    </PaneChrome>
  );
}
