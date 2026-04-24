import type { ServerPluginDefinition } from "@server/types";
import { reviewConfig } from "../shared/config";

export default {
  id: "conversation-code-review",
  name: "Conversation: Code — Review",
  description:
    "Toolbar button and full-screen view to review all worktree changes file-by-file.",
  config: reviewConfig,
} satisfies ServerPluginDefinition;
