import { utimes } from "node:fs/promises";
import { z } from "zod";
import { Log } from "@plugins/debug/plugins/logs/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { listActiveConversations } from "@plugins/tasks-core/server";
import { findTranscriptPath } from "@plugins/conversations/plugins/transcript-watcher/server";

const log = Log.channel("transcript-retention");

// Claude Code deletes session JSONL transcripts whose mtime is older than
// `cleanupPeriodDays` (default 30). Singularity reads those files directly as
// the SOLE source of truth for conversation content — it never copies them
// into Postgres — so an active-but-idle conversation would silently lose its
// transcript once 30 idle days pass. Touching every active conversation's
// JSONL daily keeps its mtime fresh, well inside the window, and keeps
// `claude --resume` working (resume reads the same file). Closed (`done`)
// conversations are intentionally left to age out, so this never bloats disk.
export const transcriptTouchJob = defineJob({
  name: "conversations.transcript-touch",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "0 4 * * *" }, // daily at 04:00 UTC
  async run() {
    const now = new Date();
    let touched = 0;
    for (const conv of await listActiveConversations()) {
      if (!conv.claudeSessionId) continue;
      const path = await findTranscriptPath(conv.claudeSessionId);
      if (!path) continue;
      await utimes(path, now, now);
      touched++;
    }
    log.publish(`touched ${touched} active transcript(s)`);
  },
});
