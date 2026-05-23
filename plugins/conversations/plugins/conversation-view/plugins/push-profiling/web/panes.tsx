import { Pane, PaneChrome, type } from "@plugins/primitives/plugins/pane/web";
import { PushProfilingPaneBody } from "./components/push-profiling-pane";

export const convPushProfilingPane = Pane.define({
  id: "conv-push-profiling",
  segment: "pp",
  input: type<{ convId: string }>(),
  component: ConvPushProfilingBody,
  width: 600,
});

function ConvPushProfilingBody() {
  return (
    <PaneChrome pane={convPushProfilingPane} title="Push Profiling">
      <PushProfilingPaneBody />
    </PaneChrome>
  );
}
