import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { sessionDivergenceConfig } from "../core";
import { sessionDivergenceMonitorJob } from "./internal/monitor-job";
import { sessionDivergenceKind } from "./internal/divergence-kind";

export default {
  description:
    "Session-divergence monitor: a per-worktree scheduled job that takes one process-table snapshot (sharing runtime-tmux's own captureProcessTree), reads the Claude session ids present in each live conversation pane's subtree, and files one deduped conversation-session-divergence report per conversation whose live session is absent from the recorded session chain while its transcript leads the chain tail's by more than the grace window — i.e. the agent is talking where the UI cannot see.",
  register: [sessionDivergenceMonitorJob],
  contributions: [
    ConfigV2.Register({ descriptor: sessionDivergenceConfig }),
    sessionDivergenceKind,
  ],
} satisfies ServerPluginDefinition;
