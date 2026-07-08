import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { onReadSetShrink } from "@plugins/database/plugins/live-state-snapshot/server";
import { readSetShrinkConfig } from "../core";
import { readSetShrinkMonitorJob } from "./internal/monitor-job";
import { readSetShrinkKind } from "./internal/read-set-shrink-kind";
import { recordShrink } from "./internal/accumulator";

export default {
  description:
    "Read-set shrink monitor: a per-backend accumulator fed (via the live-state-snapshot seam) by every persist that sheds a table from a boot-critical resource's durable read-set, plus a per-worktree scheduled job that files one deduped read-set-shrink report per shedding resource so a human can confirm it is a legitimate code-change shed rather than a conditional query that didn't fire.",
  register: [readSetShrinkMonitorJob],
  contributions: [
    ConfigV2.Register({ descriptor: readSetShrinkConfig }),
    readSetShrinkKind,
  ],
  // Subscribe the accumulator to the read-set shrink seam at boot. onReadSetShrink
  // is a single process-lifetime observer (last-writer-wins), so this is a one-time
  // install we intentionally never tear down — mirroring live-state-churn's
  // onResourcePush(recordPush) install in its own onReady.
  onReady: () => {
    onReadSetShrink(recordShrink);
  },
} satisfies ServerPluginDefinition;
