import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { transcriptTouchJob } from "./internal/touch-job";

export default {
  id: "transcript-retention",
  name: "Transcript Retention",
  description:
    "Keeps active conversations' Claude session JSONL alive by refreshing their mtime daily, so Claude Code's cleanupPeriodDays sweep never deletes a live transcript.",
  // transcriptTouchJob declares `schedule` — the jobs worker seeds its cron
  // item at startup, so registering the job is all that's needed.
  register: [transcriptTouchJob],
} satisfies ServerPluginDefinition;
