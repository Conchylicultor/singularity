import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { getConfig } from "@plugins/config_v2/server";
import { recordReport } from "@plugins/reports/server";
import { sessionDivergenceConfig } from "../../core";
import { detectDivergences } from "./detect";

// Cheap scheduled session-divergence monitor. Runs every 5 min in EACH
// worktree's own DB fork (perWorktree) because the session chain it audits lives
// in that fork's `conversation_sessions` table — the same reason queue-health
// samples its own queue. `dedup: "singleton"` means the monitor can never pile
// up, and `maxAttempts: 3` keeps a transiently-broken monitor (a `ps` that fails,
// a transcript stat that races a delete) from becoming a dead-job storm of its
// own. Silent when healthy: it files only when the predicate in ./detect trips.
export const sessionDivergenceMonitorJob = defineJob({
  name: "debug.session-divergence-monitor",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "*/5 * * * *", perWorktree: true },
  maxAttempts: 3,
  run: async () => {
    const cfg = getConfig(sessionDivergenceConfig);
    if (!cfg.enabled) return;

    const divergences = await detectDivergences(cfg.graceMinutes * 60_000);
    for (const d of divergences) {
      await recordReport({
        kind: "conversation-session-divergence",
        source: "server-session-monitor",
        data: {
          conversationId: d.conversationId,
          chainTailSessionId: d.chainTailSessionId,
          liveSubtreeSessionId: d.liveSubtreeSessionId,
          tailMtimeMs: d.tailMtimeMs,
          liveMtimeMs: d.liveMtimeMs,
        },
        message:
          `${d.conversationId} is talking in ${d.liveSubtreeSessionId}, ` +
          `not the chain tail ${d.chainTailSessionId}`,
      });
    }
  },
});
