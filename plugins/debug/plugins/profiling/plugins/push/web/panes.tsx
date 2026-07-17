import { Pane } from "@plugins/primitives/plugins/pane/web";
import { OpDetailBody } from "./components/op-detail";

export const opDetailPane = Pane.define({
  id: "debug-profiling-op-detail",
  segment: "op-profile/:opId",
  component: OpDetailBody,
  // Wider than the 380 the push detail used: this pane now hosts TWO Gantts
  // (the op's wait timeline and its step breakdown), and a Gantt row spends a
  // rigid 160px on the label column plus 64px on the duration column before the
  // track gets anything. At 380 the track collapsed to ~90px and TimeAxis's six
  // ticks overprinted each other into mush. 560 leaves the track ~330px, which
  // the ticks resolve cleanly.
  width: 560,
  resolve: false,
});
