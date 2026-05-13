import type { ServerPluginDefinition } from "@server/types";
import { Config } from "@plugins/config/server";
import { reviewConfig } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/review/shared/config";

export default {
  id: "conversation-code-review",
  name: "Conversation: Code — Review",
  description:
    "Toolbar button and full-screen view to review all worktree changes file-by-file.",
  contributions: [Config.Field(reviewConfig)],
} satisfies ServerPluginDefinition;
