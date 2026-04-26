import { Pane } from "@plugins/pane/web";
import { YakShavingRoot } from "./components/yak-root";
import { YakShavingConversationBody } from "./components/yak-conversation";

export const yakShavingPane = Pane.define({
  id: "yak-shaving",
  path: "/yak",
  component: YakShavingRoot,
});

export const yakShavingConversationPane = Pane.define({
  id: "yak-shaving-conversation",
  parent: yakShavingPane,
  path: "c/:convId",
  component: YakShavingConversationBody,
});
