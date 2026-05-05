import { Pane } from "@plugins/primitives/plugins/pane/web";
import { AttemptPane } from "./components/attempt-pane";
import { AttemptConversationBody } from "./components/attempt-conversation";

export const attemptPane = Pane.define({
  id: "attempt",
  after: [null],
  segment: "a/:attemptId",
  component: AttemptPane,
  width: 320,
});

export const attemptConversationPane = Pane.define({
  id: "attempt-conversation",
  after: [attemptPane],
  segment: "c/:convId",
  component: AttemptConversationBody,
});
