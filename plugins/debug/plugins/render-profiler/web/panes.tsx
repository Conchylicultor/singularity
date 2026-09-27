import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { RenderProfilerPane } from "./components/render-profiler-pane";

export const renderProfilerPane = Pane.define({
  title: "Render Profiler",
  route: defineRoute({
    id: "render-profiler",
    segment: "render-profiler",
  }),
  app: debugApp,
  component: RenderProfilerBody,
});

function RenderProfilerBody() {
  return (
    <PaneChrome pane={renderProfilerPane}>
      <RenderProfilerPane />
    </PaneChrome>
  );
}
