import { Pane } from "@plugins/pane/web";
import {
  conversationPane,
  markMainPane,
} from "@plugins/conversations/plugins/conversation-view/web";
import { ConvFileTreeBody } from "./components/conv-file-tree-body";
import { GlobalFileTreeBody } from "./components/global-file-tree-body";

export const globalFileTreePane = Pane.define({
  id: "global-file-tree",
  path: "/code/:worktree",
  component: GlobalFileTreeBody,
});

export const convFileTreePane = Pane.define({
  id: "conv-file-tree",
  parent: conversationPane,
  path: "files",
  component: ConvFileTreeBody,
});

// Take over the conversation main area (two-column explorer layout).
markMainPane(convFileTreePane);
