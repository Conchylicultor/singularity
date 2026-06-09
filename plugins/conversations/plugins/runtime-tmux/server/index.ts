import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Runtime } from "@plugins/conversations/server";
import { tmuxRuntime } from "./internal/tmux-runtime";

export default {
  description: "Runs Claude CLI sessions inside tmux panes.",
  register: [Runtime.define(tmuxRuntime)],
} satisfies ServerPluginDefinition;
