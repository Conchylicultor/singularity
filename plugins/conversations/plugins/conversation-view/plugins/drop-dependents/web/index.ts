import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ExitMenu } from "@plugins/conversations/plugins/conversation-view/plugins/exit-menu/web";
import { DropDependentsItem } from "./components/drop-dependents-button";

export default {
  description:
    "Exit-menu entry that drops the task and all its transitive dependents, then closes the conversation.",
  contributions: [ExitMenu.Item({ id: "drop-dependents", component: DropDependentsItem })],
} satisfies PluginDefinition;
