import type { ServerPluginDefinition } from "@server/types";
import "./internal/register";

export default {
  id: "conversations-runtime-tmux",
  name: "Conversations Runtime: tmux",
  description: "Runs Claude CLI sessions inside tmux panes.",
} satisfies ServerPluginDefinition;
