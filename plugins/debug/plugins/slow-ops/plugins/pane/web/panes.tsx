import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { SlowOpsView } from "./components/slow-ops-view";

export const slowOpsPane = Pane.define({
  id: "slow-ops",
  segment: "slow-ops",
  component: SlowOpsBody,
});

function SlowOpsBody() {
  return (
    <PaneChrome pane={slowOpsPane} title="Slow Ops">
      <SlowOpsView />
    </PaneChrome>
  );
}
