import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Runtime } from "@plugins/conversations/server";
import { tmuxRuntime } from "./internal/tmux-runtime";

// The pane→process primitives, shared with the session-divergence monitor so a
// detector checking this runtime's session resolution can never walk the process
// table differently from the resolution it is checking.
export { captureProcessTree, subtreePids } from "./internal/process-tree";
export type { ProcessTree, ProcessLister } from "./internal/process-tree";
export { listPanes } from "./internal/tmux-runtime";

export default {
  description: "Runs Claude CLI sessions inside tmux panes.",
  register: [Runtime.define(tmuxRuntime)],
} satisfies ServerPluginDefinition;
