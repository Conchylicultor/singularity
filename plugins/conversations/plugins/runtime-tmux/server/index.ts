import type { ServerPluginDefinition } from "@server/types";
import { Runtime } from "@plugins/conversations/server";
import { tmuxRuntime } from "./internal/tmux-runtime";

export default {
  id: "conversations-runtime-tmux",
  name: "Conversations Runtime: tmux",
  description: "Runs Claude CLI sessions inside tmux panes.",
  register: [Runtime.define(tmuxRuntime)],
} satisfies ServerPluginDefinition;
