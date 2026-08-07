import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { CommitsGraphBody } from "./components/commits-graph-body";

export const convCommitsGraphPane = Pane.define({
  id: "conv-commits-graph",
  segment: "commits",
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { promote: false },
  component: ConvCommitsGraphBody,
  width: 520,
});

function ConvCommitsGraphBody() {
  return (
    <PaneChrome pane={convCommitsGraphPane} title="Commits">
      <CommitsGraphBody />
    </PaneChrome>
  );
}
