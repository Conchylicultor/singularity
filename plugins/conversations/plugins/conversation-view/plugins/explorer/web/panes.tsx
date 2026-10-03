import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { ConvExplorerBody } from "./components/conv-explorer-body";

export const convFileTreePane = Pane.define({
  title: "Files",
  route: defineRoute({
    id: "conv-file-tree",
    segment: "files",
  }),
  app: agentManagerApp,
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { promote: false },
  component: ConvExplorerChromedBody,
  // Tree plus the selected file's preview beside it.
  width: 960,
});

function ConvExplorerChromedBody() {
  return (
    <PaneChrome pane={convFileTreePane}>
      <ConvExplorerBody />
    </PaneChrome>
  );
}
