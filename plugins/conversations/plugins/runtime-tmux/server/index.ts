import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Runtime } from "@plugins/conversations/server";
import { tmuxRuntime } from "./internal/tmux-runtime";

// The pane→process primitives, shared with the session-divergence monitor so a
// detector checking this runtime's session resolution can never walk the process
// table differently from the resolution it is checking.
export { captureProcessTree, subtreePids } from "./internal/process-tree";
export type { ProcessTree, ProcessLister } from "./internal/process-tree";
export { listPanes } from "./internal/tmux-runtime";
export type { TmuxPane } from "./internal/tmux-runtime";
// The pane identity a session record has to name in order to claim the pane —
// exported so an observer judging the same panes reads `%pane_id` from the same
// place the resolver does.
export type { PaneRef } from "./internal/claude-session";

export default {
  description: "Runs Claude CLI sessions inside tmux panes.",
  register: [Runtime.define(tmuxRuntime)],
} satisfies ServerPluginDefinition;
