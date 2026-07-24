import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { transcriptTouchJob } from "./internal/touch-job";

export default {
  description:
    "Keeps retained conversations' Claude session JSONL alive by refreshing their mtime daily — active rows plus every conversation of a held task — so Claude Code's cleanupPeriodDays sweep never deletes a transcript the user can still come back to.",
  // transcriptTouchJob declares `schedule` — the jobs worker seeds its cron
  // item at startup, so registering the job is all that's needed.
  register: [transcriptTouchJob],
} satisfies ServerPluginDefinition;
