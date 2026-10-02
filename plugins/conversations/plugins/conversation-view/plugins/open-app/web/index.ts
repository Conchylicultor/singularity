import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { OpenAppButton } from "./components/open-app-button";
import {
  appPreviewPane,
  OpenInNewTabAction,
  ToggleChromeAction,
} from "./app-preview-pane";

export default {
  description:
    "Opens the conversation's namespace (`http://<id>.localhost:9000`) framed in a pane beside the chat, on the page its task was filed from when one was attached (else `/`); a header toggle shows or hides the framed app's own chrome; ⌘/middle-click, or the pane's Open in new tab action, opens it in a browser tab instead. Disabled until the worktree has a successful build (op-store build history).",
  contributions: [
    Conversation.ActionBar({ id: "open-app", component: OpenAppButton }),
    Pane.Register({ pane: appPreviewPane }),
    appPreviewPane.Actions({
      id: "toggle-chrome",
      component: ToggleChromeAction,
    }),
    appPreviewPane.Actions({
      id: "open-in-new-tab",
      component: OpenInNewTabAction,
    }),
  ],
  slots: {
    "app-preview": appPreviewPane,
  },
} satisfies PluginDefinition;
