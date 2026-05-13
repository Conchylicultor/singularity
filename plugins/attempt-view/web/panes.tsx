import { Pane } from "@plugins/primitives/plugins/pane/web";
import { AttemptPane } from "./components/attempt-pane";

export const attemptPane = Pane.define({
  id: "attempt",
  segment: "a/:attemptId",
  component: AttemptPane,
  width: 320,
});
