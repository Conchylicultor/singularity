import type { ServerPluginDefinition } from "../../../../../server/src/types";
import { Runtime } from "@plugins/conversations/server/api";
import { tmuxRuntime } from "./internal/tmux-runtime";

Runtime.register(tmuxRuntime);

const plugin: ServerPluginDefinition = {
  id: "conversations-runtime-tmux",
  name: "Conversations Runtime: tmux",
  description: "Runs Claude CLI sessions inside tmux panes.",
};
export default plugin;
