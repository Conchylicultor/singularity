import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { SlowOps } from "./slots";

export const slowOpsPane = Pane.define({
  id: "slow-ops",
  segment: "slow-ops",
  component: SlowOpsBody,
});

function SlowOpsBody() {
  return (
    <PaneChrome pane={slowOpsPane} title="Slow Ops">
      <SlowOps.Host />
    </PaneChrome>
  );
}
