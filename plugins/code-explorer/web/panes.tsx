import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { ConvFileTreeBody } from "./components/conv-file-tree-body";
import { GlobalFileTreeBody } from "./components/global-file-tree-body";

export const globalFileTreePane = Pane.define({
  id: "global-file-tree",
  path: "/code/:worktree",
  component: GlobalFileTreeChromedBody,
});

export const convFileTreePane = Pane.define({
  id: "conv-file-tree",
  parent: conversationPane,
  path: "files",
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
