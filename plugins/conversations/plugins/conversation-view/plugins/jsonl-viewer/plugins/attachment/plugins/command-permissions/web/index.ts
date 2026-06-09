import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { CommandPermissionsView } from "./components/command-permissions-view";

export default {
  collapsed: true,
  description:
    "Renders command-permissions attachment events showing permission grants for the session.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "command_permissions",
      component: CommandPermissionsView,
    }),
  ],
} satisfies PluginDefinition;
