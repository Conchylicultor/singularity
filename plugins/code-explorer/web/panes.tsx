import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { ConvFileTreeBody } from "./components/conv-file-tree-body";
import { GlobalFileTreeBody } from "./components/global-file-tree-body";

export const globalFileTreePane = Pane.define({
  id: "global-file-tree",
  segment: "code/:worktree",
  component: GlobalFileTreeChromedBody,
  resolve: false,
});

export const convFileTreePane = Pane.define({
  id: "conv-file-tree",
  segment: "files",
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { promote: false },
  component: ConvFileTreeChromedBody,
  width: 280,
});

function GlobalFileTreeChromedBody() {
  const { worktree } = globalFileTreePane.useParams();
  return (
    <PaneChrome pane={globalFileTreePane} title={`Files · ${worktree}`}>
      <GlobalFileTreeBody />
    </PaneChrome>
  );
}

function ConvFileTreeChromedBody() {
  return (
    <PaneChrome pane={convFileTreePane} title="Files">
      <ConvFileTreeBody />
    </PaneChrome>
  );
}
